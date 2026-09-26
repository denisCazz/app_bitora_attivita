import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { htmlToText, isPrivateAddress, publicHttpUrl } from "@rapportini/shared";
import { HttpError } from "../errors";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const MAX_TEXT = 24_000;

export async function readPublicPage(value: string): Promise<string> {
  let current = siteUrl(value);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const address = await publicAddress(current.hostname);
    const response = await requestPinned(current, address);
    if (response.status >= 300 && response.status < 400) {
      const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
      if (!location || hop === MAX_REDIRECTS) throw new HttpError(400, "Il sito rimanda troppo lontano");
      current = siteUrl(new URL(location, current).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new HttpError(400, "Il sito non ha risposto con una pagina");
    const type = String(response.headers["content-type"] ?? "");
    if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) throw new HttpError(400, "Questa pagina non è un menu leggibile");
    const text = htmlToText(response.body).slice(0, MAX_TEXT);
    if (text.length < 40) throw new HttpError(400, "Nella pagina non c'è abbastanza testo da leggere");
    return text;
  }
  throw new HttpError(400, "Il sito rimanda troppo lontano");
}

function siteUrl(value: string): URL {
  try {
    return publicHttpUrl(value);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Indirizzo non valido");
  }
}

async function publicAddress(hostname: string): Promise<string> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new HttpError(400, "Questo indirizzo non è raggiungibile");
    return hostname;
  }
  const records = await lookup(hostname, { all: true, verbatim: true }).catch(() => {
    throw new HttpError(400, "Non riesco a raggiungere questo sito");
  });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) {
    throw new HttpError(400, "Questo indirizzo non è raggiungibile");
  }
  return records[0]!.address;
}

function requestPinned(target: URL, address: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const lib = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: HttpError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const req = lib.request(
      {
        host: address,
        servername: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}` || "/",
        method: "GET",
        headers: {
          host: target.host,
          accept: "text/html,text/plain;q=0.9",
          "accept-encoding": "identity",
          "user-agent": "Bitora/1.0",
        },
        timeout: 12_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            fail(new HttpError(400, "La pagina è troppo grande"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      fail(new HttpError(400, "Il sito ci ha messo troppo a rispondere"));
    });
    req.on("error", () => fail(new HttpError(400, "Non riesco a raggiungere questo sito")));
    req.end();
  });
}
