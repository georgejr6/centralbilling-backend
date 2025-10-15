import { generateKeyPair, exportJWK, SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import Key from "../models/key.model.js";

export async function ensureActiveKey() {
  let key = await Key.findOne({ status: "active" });
  if (key) return key;

  // ✅ make keys extractable so we can export as JWK
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true, // <-- important
    // modulusLength: 2048, // optional: default is fine
  });

  const [publicJwk, privateJwk] = await Promise.all([
    exportJWK(publicKey),
    exportJWK(privateKey),
  ]);

  const kid = crypto.randomUUID();
  publicJwk.kid = kid; publicJwk.alg = "RS256"; publicJwk.use = "sig";
  privateJwk.kid = kid; privateJwk.alg = "RS256"; privateJwk.use = "sig";

  key = await Key.create({ kid, publicJwk, privateJwk, status: "active" });
  return key;
}

export async function getJWKS() {
  const keys = await Key.find({ status: { $in: ["active", "retired"] } });
  return { keys: keys.map((k) => k.publicJwk) };
}

// utils/jwt.util.js
export async function signAccessToken({ sub, aud, scope, claims = {} }) {
  const key = await ensureActiveKey();
  const issuer = process.env.ISSUER;
  const ttl = parseInt(process.env.ACCESS_TOKEN_TTL || "3600", 10);
  const now = Math.floor(Date.now() / 1000);

  // 👇 ensure claims are plain JSON (no Mongoose docs/arrays/etc.)
  const cleanClaims = JSON.parse(JSON.stringify(claims));

  // 'aud' can be string or string[]; both are fine for jose
  const audienceValue = Array.isArray(aud) && aud.length === 1 ? aud[0] : aud;

  const jwt = await new SignJWT({
    ...cleanClaims,
    scope, // keep scope as a simple string
  })
    .setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audienceValue)
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(await importJWK(key.privateJwk, "RS256"));

  return jwt;
}


export async function signIdToken({ sub, claims = {} }) {
  const key = await ensureActiveKey();
  const issuer = process.env.ISSUER;
  const ttl = 600;
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "JWT" })
    .setIssuer(issuer)
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(await importJWK(key.privateJwk, "RS256"));
  return jwt;
}

export async function verifyJWT(token, audience) {
  const jwks = await getJWKS();
  const getKey = async (header) => {
    const match = jwks.keys.find((k) => k.kid === header.kid);
    if (!match) throw new Error("Unknown kid");
    const { importJWK } = await import("jose");
    return importJWK(match, match.alg);
  };
  const { payload } = await jwtVerify(token, getKey, {
    issuer: process.env.ISSUER,
    audience,
  });
  return payload;
}

// dynamic import helper (avoid circular top-level)
async function importJWK(jwk, alg) {
  const { importJWK } = await import("jose");
  return importJWK(jwk, alg);
}
