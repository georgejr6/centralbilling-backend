import { Router } from "express";
import { getJWKS } from "../utils/jwt.util.js";

const router = Router();

router.get("/jwks.json", async (req, res, next) => {
  try {
    const jwks = await getJWKS();
    res.json(jwks);
  } catch (e) {
    next(e);
  }
});

export default router;
