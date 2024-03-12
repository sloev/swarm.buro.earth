import { arr2text, arr2hex, hex2bin, bin2hex, randomBytes } from "uint8-util";

const generate = async (origin, appname) => {
  const hashLimit = 20;

  const encodeBytes = (txt) => new TextEncoder().encode(txt);

  try {
    const hash = await crypto.subtle
      .digest("SHA-1", encodeBytes(`${appname}:${origin}`))
      .then((buffer) =>
        Array.from(new Uint8Array(buffer))
          .map((b) => b.toString(36))
          .join("")
          .slice(0, hashLimit)
      );
    const hexHash = bin2hex(hash);
    return hexHash;
  } catch (e) {
    throw e;
    // Deal with the fact the chain failed
  }
  // `text` is not available here
};

function onFormSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  const dataObject = Object.fromEntries(data.entries());

  console.log("submit", dataObject);
  generate(dataObject.origin, dataObject.name).then((infohash) => {
    const outputelem = document.getElementById("output");
    outputelem.style.display = "block"
    const infohashelem = document.getElementById("infohash");
    const line =   dataObject.name+"="+JSON.stringify({origin:dataObject.origin, hash:infohash})
    infohashelem.textContent =line
    navigator.clipboard.writeText(line);
  });

  // Your form handling code here
}
const form = document.getElementById("my-form");

form.addEventListener("submit", onFormSubmit);
