import { Router } from "express";
import * as bankModel from "../models/bank.js";

const router = Router();

/* Public bank list for exam selectors: names and counts only, never answers. */
router.get("/", (req, res) => {
  res.json(bankModel.listAll().map(b => ({
    id: b.id,
    name: b.name,
    description: b.description,
    is_default: b.is_default,
    counts: b.counts,
    total: b.total,
  })));
});

export default router;
