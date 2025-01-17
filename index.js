require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const nodemailer = require("nodemailer");
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

//send email using nodemailer
const sendMail = (emailAddress, emailData) => {
  //create transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user: process.env.NODE_MAILER_USER,
      pass: process.env.NODE_MAILER_PASS,
    },
  });
  transporter.verify((error, success) => {
    if (error) {
      console.log(error);
    } else {
      console.log(`transporter is ready to take emails`, success);
    }
  });

  const mailBody = {
    from: process.env.NODE_MAILER_USER, // sender address
    to: emailAddress, // list of receivers
    subject: emailData?.subject, // Subject line
    text: emailData?.message, // plain text body
    html: `<p>${emailData?.message}</p>`, // html body
  };
  transporter.sendMail(mailBody, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Email Sent, ", info);
    }
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

    //verify admin
    const verifyAdmin = async (req, res, next) => {
      console.log("data from verifyTOken", req.user);
      const email = req.user.email;
      const query = { email };
      const result = await userCollection.findOne(query);
      if (!result || result?.role !== "Admin")
        return res.status(403).send({ message: "Unauthorized Access" });
      next();
    };

    //verify Seller
    const verifySeller = async (req, res, next) => {
      const email = req.user.email;
      const query = { email };
      const result = await userCollection.findOne(query);
      if (!result || result?.role !== "Seller")
        return res.status(403).send({ message: "Unauthorized Access" });
      next();
    };

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
      sendMail(email, {
        subject: "Login Successful",
        message: "You have logged in my website. Welcome to a new era!  ",
      });
      res.send(result);
    });

    //get all user data
    app.get("/all-users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email: { $ne: email } };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });
    //get user role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send({ role: result?.role });
    });

    //change users role
    app.patch(
      "/user/role/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const { role } = req.body;
        const filter = { email: email };
        const updatedDoc = {
          $set: { role, status: "Verified" },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    //save a plant

    app.post("/plants", verifyToken, verifySeller, async (req, res) => {
      const plant = req.body;
      const result = await plantsCollection.insertOne(plant);
      res.send(result);
    });

    //get all plants from db
    app.get("/plants", async (req, res) => {
      const result = await plantsCollection.find().toArray();
      res.send(result);
    });

    //get plants based on seller email
    app.get("/plants/seller", verifyToken, verifySeller, async (req, res) => {
      const email = req.user.email;
      const query = { "seller.email": email };
      const result = await plantsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/plants/:id", verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await plantsCollection.deleteOne(query);
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

    //get all plants data based on the seller
    app.get("/plants/seller", async (req, res) => {
      res.send("Hello");
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

    ///get all orders for a specific seller
    app.get(
      "/seller-orders/:email",
      verifyToken,
      verifySeller,
      async (req, res) => {
        const email = req.params.email;

        const query = { seller: email };
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
      }
    );

    //update order status
    app.patch("/orders/:id", verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: { status },
      };
      const result = await ordersCollection.updateOne(query, updatedDoc);
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
