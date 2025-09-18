const express = require("express");
const router = new express.Router();
const userdb = require("../models/userSchema");
var bcrypt = require("bcryptjs");
const authenticate = require("../middleware/authenticate");

const jwt = require("jsonwebtoken");
const keysecret = process.env.SECRET_KEY;

const authorizeRole = require("../middleware/authorizeRole");




// for user registration
router.post("/register", async (req, res) => {
    const { fname, email, password, cpassword, role } = req.body;

    if (!fname || !email || !password || !cpassword) {
        res.status(422).json({ error: "fill all the details" })
    }

    try {
        const preuser = await userdb.findOne({ email: email });

        if (preuser) {
            res.status(422).json({ error: "This Email is Already Exist" })
        } else if (password !== cpassword) {
            res.status(422).json({ error: "Password and Confirm Password Not Match" })
        } else {
            const finalUser = new userdb({
                fname, 
                email, 
                password, 
                cpassword,
                role: role || "user" // Set default role to user if not provided
            });

            // here password hasing happens via the model pre-save hook

            const storeData = await finalUser.save();

            res.status(201).json({ status: 201, storeData })
        }
    } catch (error) {
        res.status(422).json(error);
        console.log("catch block error");
    }
});

// Update user details (admin only)
router.patch("/update-user/:id", authenticate, authorizeRole("admin"), async (req, res) => {
    const { id } = req.params;
    const { fname, email, role } = req.body;
    
    try {
        // Check if user exists
        const userExists = await userdb.findById(id);
        if (!userExists) {
            return res.status(404).json({ status: 404, message: "User not found" });
        }
        
        // Update user fields
        const updatedUser = await userdb.findByIdAndUpdate(
            id,
            { 
                fname: fname || userExists.fname,
                email: email || userExists.email,
                role: role || userExists.role 
            },
            { new: true, runValidators: true }
        );
        
        res.status(200).json({ status: 200, user: updatedUser });
    } catch (error) {
        res.status(500).json({ status: 500, message: "Error updating user", error: error.message });
    }
});

// Delete user (admin only)
router.delete("/delete-user/:id", authenticate, authorizeRole("admin"), async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if user exists
        const userExists = await userdb.findById(id);
        if (!userExists) {
            return res.status(404).json({ status: 404, message: "User not found" });
        }
        
        // Delete user
        await userdb.findByIdAndDelete(id);
        
        res.status(200).json({ status: 200, message: "User deleted successfully" });
    } catch (error) {
        res.status(500).json({ status: 500, message: "Error deleting user", error: error.message });
    }
});
router.get("/token-version", authenticate, async (req, res) => {
  try {
    const user = await userdb.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(200).json({ tokenVersion: user.tokenVersion || 0 });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// user Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(422).json({ error: "fill all the details" });
  }

  try {
    const userValid = await userdb.findOne({ email: email });

    if (userValid) {
      const isMatch = await bcrypt.compare(password, userValid.password);

      if (!isMatch) {
        return res.status(422).json({ error: "invalid details" });
      } else {
        // increment tokenVersion
        userValid.tokenVersion = (userValid.tokenVersion || 0) + 1;
        await userValid.save();

        // generate token
        const token = await userValid.generateAuthtoken();

        // set cookie
        res.cookie("usercookie", token, {
          expires: new Date(Date.now() + 9000000),
          httpOnly: true,
        });

        res.status(201).json({ status: 201, result: { userValid, token } });
      }
    } else {
      res.status(401).json({ status: 401, message: "invalid details" });
    }
  } catch (error) {
    res.status(401).json({ status: 401, error });
  }
});


// user valid
router.get("/validuser",authenticate,async(req,res)=>{
    try {
        const ValidUserOne = await userdb.findOne({_id:req.userId});
        res.status(201).json({status:201,ValidUserOne});
    } catch (error) {
        res.status(401).json({status:401,error});
    }
});

// user logout
router.get("/logout",authenticate,async(req,res)=>{
    try {
        req.rootUser.tokens =  req.rootUser.tokens.filter((curelem)=>{
            return curelem.token !== req.token
        });

        res.clearCookie("usercookie",{path:"/"});

        req.rootUser.save();

        res.status(201).json({status:201})

    } catch (error) {
        res.status(401).json({status:401,error})
    }
});


// ADD this simple test route to check database state
router.get("/test-token/:id", async (req, res) => {
    try {
        const user = await userdb.findById(req.params.id);
        res.json({
            found: !!user,
            userId: user?._id,
            email: user?.email,
            hasToken: !!user?.verifytoken,
            tokenLength: user?.verifytoken?.length || 0,
            tokenPreview: user?.verifytoken?.substring(0, 30) + "..." || "No token"
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});




// Also add this test route to manually check what's in the database
router.get("/debug-user/:id", async (req, res) => {
    try {
        const user = await userdb.findById(req.params.id);
        if (!user) {
            return res.json({ error: "User not found" });
        }
        
        res.json({
            userId: user._id,
            email: user.email,
            hasVerifyToken: !!user.verifytoken,
            verifyTokenLength: user.verifytoken ? user.verifytoken.length : 0,
            verifyToken: user.verifytoken, // Be careful with this in production
            tokenPreview: user.verifytoken ? user.verifytoken.substring(0, 20) + "..." : null
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Route to update a user's role (admin only)
router.patch("/update-role/:id", authenticate, authorizeRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  // Acceptable roles
  if (!["user", "admin"].includes(role)) {
    return res.status(400).json({ status: 400, message: "Invalid role value" });
  }

  try {
    const updatedUser = await userdb.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    res.status(200).json({ status: 200, updatedUser });
  } catch (error) {
    res.status(500).json({ status: 500, message: "Error updating role", error: error.message });
  }
});

// Admin Dashboard Route (admin only)
router.get("/admin-dashboard", authenticate, authorizeRole("admin"), async (req, res) => {
    try {
      const allUsers = await userdb.find();
      const userCount = allUsers.length;
  
      res.status(200).json({
        status: 200,
        message: "Admin Dashboard Data",
        userCount: userCount,
        allUsers: allUsers,
      });
    } catch (error) {
      res.status(500).json({ status: 500, message: "Error fetching admin dashboard data", error: error.message });
    }
});
  






module.exports = router;