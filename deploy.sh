#!/bin/bash


pushd server

scp index.js buroearth:/etc/bittorrent/index.js
scp package.json buroearth:/etc/bittorrent/package.json
scp run.sh buroearth:/etc/bittorrent/run.sh

popd

scp infohashes.json buroearth:/etc/bittorrent/infohashes.json
ssh buroearth 'systemctl restart tracker.service; bash -l'