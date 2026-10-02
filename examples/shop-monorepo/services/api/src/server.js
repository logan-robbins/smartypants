import express from "express";
import pg from "pg";
import Redis from "ioredis";
import { Kafka } from "kafkajs";
import Stripe from "stripe";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const cache = new Redis(process.env.REDIS_URL);
const producer = new Kafka({ brokers: [process.env.KAFKA_BROKERS] }).producer();
const stripe = new Stripe(process.env.STRIPE_KEY);
const app = express();
app.use(express.json());

app.get("/products", async (_req, res) => {
  const hit = await cache.get("products");
  if (hit) return res.json(JSON.parse(hit));
  const { rows } = await db.query("SELECT id, name, price FROM products");
  await cache.set("products", JSON.stringify(rows), "EX", 60);
  res.json(rows);
});

app.post("/orders", async (req, res) => {
  const intent = await stripe.paymentIntents.create({ amount: req.body.total, currency: "usd" });
  const { rows } = await db.query("INSERT INTO orders(customer_id, total, payment_intent) VALUES ($1,$2,$3) RETURNING id", [req.body.customerId, req.body.total, intent.id]);
  await producer.send({ topic: "orders.placed", messages: [{ value: JSON.stringify({ orderId: rows[0].id }) }] });
  res.status(201).json({ id: rows[0].id });
});

app.listen(8080);
