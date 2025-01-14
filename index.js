require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");

const port = process.env.PORT || 9000;
const app = express();
// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USEr}:${process.env.DB_PASS}@ratul.gtek0.mongodb.net/?retryWrites=true&w=majority&appName=Ratul
`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const database = client.db("Plantnet");
    const userCollection = database.collection("users");
    const plantsCollection = database.collection("plants");
    const ordersCollection = database.collection("orders");
    //save or update user
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = req.body;

      //check if user already exits
      const isExist = await userCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }

      //if no user already exists insert a user
      const result = await userCollection.insertOne({
        ...user,
        role: "Customer",
        timestamp: Date.now(),
      });
      res.send(result);
    });

    //get user role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send({ role: result?.role });
    });
    //save a plant

    app.post("/plants", verifyToken, async (req, res) => {
      const plant = req.body;
      const result = await plantsCollection.insertOne(plant);
      res.send(result);
    });

    //get all plants from db
    app.get("/plants", async (req, res) => {
      const result = await plantsCollection.find().toArray();
      res.send(result);
    });

    app.get("/plants/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await plantsCollection.findOne(query);
      res.send(result);
    });

    //save plant order on db
    app.post("/orders", verifyToken, async (req, res) => {
      const orderInfo = req.body;

      const result = await ordersCollection.insertOne(orderInfo);
      res.send(result);
    });

    //update plants quantity
    app.patch("/plants/quantity/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { quantityToUpdate, status } = req.body;
      const filter = { _id: new ObjectId(id) };
      let updateDoc = {
        $inc: { quantity: -quantityToUpdate },
      };
      if (status === "increase") {
        updateDoc = {
          $inc: { quantity: quantityToUpdate },
        };
      }
      const result = await plantsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //get users orders
    app.get("/customer-orders/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      const query = { "customer.email": email };
      const result = await ordersCollection
        .aggregate([
          {
            $match: query, //match specific customers data only
          },
          {
            $addFields: {
              plantId: { $toObjectId: "$plantId" }, //convert their plantId to objectId
            },
          },
          {
            $lookup: {
              from: "plants", //go to plants collection
              localField: "plantId", // and using the plantId
              foreignField: "_id", // see if their _id matches
              as: "plants", //return the matching data as plants
            },
          },
          {
            $unwind: "$plants", //pop the plants object from an array
          },
          {
            $addFields: {
              name: "$plants.name", //add
              category: "$plants.category",
              image: "$plants.image",
            },
          },
          {
            $project: {
              plants: 0,
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    //cancel delete and order
    app.delete("/orders/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const order = await ordersCollection.findOne(query);
      if (order.status === "Delivered")
        return res.status(409).send("Cannot cancel once product is delivered");
      const result = await ordersCollection.deleteOne(query);
      console.log(result);
      res.send(result);
    });

    //manage user status
    app.patch("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (!user || user.status === "requested") {
        return res.status(400).send("You have already requested");
      }

      const updatedDoc = {
        $set: {
          status: "requested",
        },
      };
      const result = await userCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    // Generate jwt token
    app.post("/jwt", async (req, res) => {
      const email = req.body;

      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from plantNet Server..");
});

app.listen(port, () => {
  console.log(`plantNet is running on port ${port}`);
});
