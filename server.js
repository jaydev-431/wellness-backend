import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const MONGODB_URI = "mongodb+srv://2400030431_db_user:1NU5rRd4yMigeD1B@cluster0.pbftoeg.mongodb.net/wellnessbridge?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB Atlas');
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', function() {
  console.log('MongoDB Atlas connected');
});

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  age: { type: Number, required: true, min: 1 },
  gender: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ["victim", "counselor", "legal"] },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const confessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true },
  confession: { type: String, required: true },
  status: { type: String, default: "pending" },
  counselorReply: { type: String, default: "" },
  counselorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  counselorRepliedAt: { type: Date },
  legalAdvice: { type: String, default: "" },
  legalAdvisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  legalAdvisedAt: { type: Date },
  legalStatus: { type: String, default: "pending" }
}, { timestamps: true });

const Confession = mongoose.model("Confession", confessionSchema);

app.post("/signup", async (req, res) => {
  try {
    const { fullName, age, gender, email, password, role } = req.body;

    if (!fullName || !age || !gender || !email || !password || !role) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields are required" 
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "User already exists" 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      fullName,
      age,
      gender,
      email,
      password: hashedPassword,
      role
    });

    await newUser.save();

    res.status(201).json({ 
      success: true, 
      message: "User created successfully" 
    });

  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error during signup" 
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password required" 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    res.json({
      success: true,
      message: "Login successful",
      role: user.role,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error during login" 
    });
  }
});

app.post("/api/confessions", async (req, res) => {
  try {
    const { userId, category, confession } = req.body;

    if (!userId || !category || !confession) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields required" 
      });
    }

    const newConfession = new Confession({
      userId,
      category,
      confession,
      status: "pending"
    });

    await newConfession.save();

    res.status(201).json({ 
      success: true, 
      message: "Confession submitted",
      confessionId: newConfession._id
    });

  } catch (error) {
    console.error("Confession error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

app.get("/api/confessions", async (req, res) => {
  try {
    const confessions = await Confession.find()
      .populate('userId', 'fullName email age gender')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: confessions
    });
  } catch (error) {
    console.error("Error fetching confessions:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

app.get("/api/my-confessions/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    const confessions = await Confession.find({ userId })
      .populate('counselorId', 'fullName')
      .populate('legalAdvisorId', 'fullName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: confessions
    });
  } catch (error) {
    console.error("Error fetching user confessions:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

app.post("/api/replies", async (req, res) => {
  try {
    const { confessionId, counselorId, message } = req.body;

    if (!confessionId || !counselorId || !message) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields required" 
      });
    }

    const updatedConfession = await Confession.findByIdAndUpdate(
      confessionId,
      { 
        counselorReply: message,
        counselorId: counselorId,
        counselorRepliedAt: new Date(),
        status: "reviewed"
      },
      { new: true }
    ).populate('userId', 'fullName email');

    if (!updatedConfession) {
      return res.status(404).json({ 
        success: false, 
        message: "Confession not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "Reply sent" 
    });

  } catch (error) {
    console.error("Reply error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

app.get("/api/legal-cases", async (req, res) => {
  try {
    const legalCases = await Confession.find({
      $or: [
        { category: "legal" },
        { category: "safety" },
        { category: "child" },
        { category: "financial" }
      ]
    })
    .populate('userId', 'fullName email age gender')
    .populate('counselorId', 'fullName')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: legalCases
    });
  } catch (error) {
    console.error("Legal cases error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

app.post("/api/legal-advice", async (req, res) => {
  try {
    const { caseId, legalAdvisorId, advice } = req.body;

    if (!caseId || !legalAdvisorId || !advice) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields required" 
      });
    }

    const updatedCase = await Confession.findByIdAndUpdate(
      caseId,
      { 
        legalAdvice: advice,
        legalAdvisorId: legalAdvisorId,
        legalAdvisedAt: new Date(),
        legalStatus: "reviewed"
      },
      { new: true }
    ).populate('userId', 'fullName email');

    if (!updatedCase) {
      return res.status(404).json({ 
        success: false, 
        message: "Case not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "Legal advice submitted" 
    });

  } catch (error) {
    console.error("Legal advice error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ 
    success: true,
    message: "WellnessBridge Backend running",
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    timestamp: new Date().toISOString()
  });
});

app.get("/", (req, res) => {
  res.json({ 
    success: true,
    message: "WellnessBridge Server running"
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});