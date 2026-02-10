const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set in the environment");
}
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("mydb");
    const users = db.collection("users");

    await users.insertOne({ name: "Alice", age: 25 });
    const allUsers = await users.find().toArray();

    console.log("Users:", allUsers);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

run();
