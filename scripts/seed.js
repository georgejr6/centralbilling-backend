// scripts/seed.js
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import stripe from "../utils/stripe.util.js";

await mongoose.connect(process.env.MONGO_URI);

const email = "owner@example.com";
const sub = crypto.randomUUID();
const stripeCustomer = await stripe.customers.create({ email });

const user = await User.create({
  sub,
  email,
  emailVerified: true,
  passwordHash: await bcrypt.hash("Passw0rd!", 10),
  stripeCustomerId: stripeCustomer.id,
  roles: ["owner"]
});

console.log("seeded user:", user);
process.exit(0);
