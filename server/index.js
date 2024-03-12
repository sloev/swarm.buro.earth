import { Server } from "bittorrent-tracker";
import peerid from "bittorrent-peerid";
import fs from "fs";
import { makeBadge } from "badge-maker";

const infohashConfigData = JSON.parse(fs.readFileSync("./infohashes.json"));
const infohashToApp = {};
Object.keys(infohashConfigData).map((origin) => {
  const hash = infohashConfigData[origin];
  infohashToApp[hash] = {
    origin,
  };
});

import http from "http";
import { info } from "console";

const server = new Server({
  udp: false, // enable udp server? [default=true]
  http: true, // enable http server? [default=true]
  ws: true, // enable websocket server? [default=true]
  stats: false, // enable web-based statistics? [default=true]
  trustProxy: false, // enable trusting x-forwarded-for header for remote IP [default=false]
  filter: function (infoHash, params, cb) {
    // Blacklist/whitelist function for allowing/disallowing torrents. If this option is
    // omitted, all torrents are allowed. It is possible to interface with a database or
    // external system before deciding to allow/deny, because this function is async.

    // It is possible to block by peer id (whitelisting torrent clients) or by secret
    // key (private trackers). Full access to the original HTTP/UDP request parameters
    // are available in `params`.

    // This example only allows one torrent.

    const allowed = infohashToApp[infoHash];
    if (allowed) {
      // If the callback is passed `null`, the torrent will be allowed.
      cb(null);
    } else {
      // If the callback is passed an `Error` object, the torrent will be disallowed
      // and the error's `message` property will be given as the reason.
      cb(new Error("disallowed torrent"));
    }
  },
});
server.http.on("request", (req, res) => {
  if (res.headersSent) return;

  const infoHashes = Object.keys(server.torrents);
  let activeTorrents = 0;
  const allPeers = {};

  function countPeers(filterFunction) {
    let count = 0;
    let key;

    for (key in allPeers) {
      if (hasOwnProperty.call(allPeers, key) && filterFunction(allPeers[key])) {
        count++;
      }
    }

    return count;
  }

  function groupByClient() {
    const clients = {};
    for (const key in allPeers) {
      if (hasOwnProperty.call(allPeers, key)) {
        const peer = allPeers[key];

        if (!clients[peer.client.client]) {
          clients[peer.client.client] = {};
        }
        const client = clients[peer.client.client];
        // If the client is not known show 8 chars from peerId as version
        const version =
          peer.client.version ||
          Buffer.from(peer.peerId, "hex").toString().substring(0, 8);
        if (!client[version]) {
          client[version] = 0;
        }
        client[version]++;
      }
    }
    return clients;
  }

  function printClients(clients) {
    let html = "<ul>\n";
    for (const name in clients) {
      if (hasOwnProperty.call(clients, name)) {
        const client = clients[name];
        for (const version in client) {
          if (hasOwnProperty.call(client, version)) {
            html += `<li><strong>${name}</strong> ${version} : ${client[version]}</li>\n`;
          }
        }
      }
    }
    html += "</ul>";
    return html;
  }

  if (
    req.method === "GET" &&
    (req.url === "/stats" || req.url === "/stats.json")
  ) {
    infoHashes.forEach((infoHash) => {
      const peers = server.torrents[infoHash].peers;
      const keys = peers.keys;
      if (keys.length > 0) activeTorrents++;

      keys.forEach((peerId) => {
        // Don't mark the peer as most recently used for stats
        const peer = peers.peek(peerId);
        if (peer == null) return; // peers.peek() can evict the peer

        if (!hasOwnProperty.call(allPeers, peerId)) {
          allPeers[peerId] = {
            ipv4: false,
            ipv6: false,
            seeder: false,
            leecher: false,
          };
        }

        if (peer.ip.includes(":")) {
          allPeers[peerId].ipv6 = true;
        } else {
          allPeers[peerId].ipv4 = true;
        }

        if (peer.complete) {
          allPeers[peerId].seeder = true;
        } else {
          allPeers[peerId].leecher = true;
        }

        allPeers[peerId].peerId = peer.peerId;
        allPeers[peerId].client = peerid(peer.peerId);
      });
    });

    const isSeederOnly = (peer) => peer.seeder && peer.leecher === false;
    const isLeecherOnly = (peer) => peer.leecher && peer.seeder === false;
    const isSeederAndLeecher = (peer) => peer.seeder && peer.leecher;
    const isIPv4 = (peer) => peer.ipv4;
    const isIPv6 = (peer) => peer.ipv6;

    const peersPerTorrent = {};

    Object.keys(infohashToApp).map((hash) => {
      const torrent = server.torrents[hash];
      let totalPeers = 0;
      if (torrent) {
        totalPeers = torrent.complete + torrent.incomplete;
      }
      peersPerTorrent[hash] = {
        peers: totalPeers,
        ...infohashToApp[hash],
      };
    });

    const stats = {
      torrents: peersPerTorrent,
      activeTorrents,
      peersAll: Object.keys(allPeers).length,
      peersSeederOnly: countPeers(isSeederOnly),
      peersLeecherOnly: countPeers(isLeecherOnly),
      peersSeederAndLeecher: countPeers(isSeederAndLeecher),
      peersIPv4: countPeers(isIPv4),
      peersIPv6: countPeers(isIPv6),
      clients: groupByClient(),
    };

    if (
      req.url === "/stats.json" ||
      req.headers.accept === "application/json"
    ) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(stats));
    }
  } else if (req.method === "GET" && req.url === "/origin_stats.svg") {
    const origin = req.headers["x-forwarded-host"];

    const hash = infohashConfigData[origin];

    if (hash) {
      const torrent = server.torrents[hash];
      let totalPeers = 0;
      if (torrent) {
        totalPeers = torrent.complete + torrent.incomplete;
      }

      const format = {
        message: `${totalPeers} peers are online with you`,
        color: "green",
      };

      const svg = makeBadge(format);
      res.setHeader("Content-Type", "image/svg+xml");      
      res.end(svg);
    }
  }
});

server.on("error", function (err) {
  // fatal server error!
  console.log(err.message);
});

server.on("warning", function (err) {
  // client sent bad data. probably not a problem, just a buggy client.
  console.log(err.message);
});

server.on("listening", function () {
  // fired when all requested servers are listening

  // WS
  const wsAddr = server.ws.address();
  const wsHost = wsAddr.address !== "::" ? wsAddr.address : "localhost";
  const wsPort = wsAddr.port;
  console.log(`WebSocket tracker: ws://${wsHost}:${wsPort}`);
});

// start tracker server listening! Use 0 to listen on a random free port.
const port = 9002;
const hostname = "localhost";
server.listen(port, hostname, () => {
  // Do something on listening...
});
