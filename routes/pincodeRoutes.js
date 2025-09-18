// routes/pincodeRoutes.js
const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");
const pincodedb = require("../models/pincodeSchema");

// ✅ 1. Add new pincode (Admin only)
router.post("/add", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { pincode, area, city, state, codAvailable, deliveryCharge, estimatedDeliveryDays } = req.body;
    const adminId = req.rootUser._id;
    
    // Check if pincode already exists
    const existingPincode = await pincodedb.findOne({ pincode: pincode.trim() });
    
    if (existingPincode) {
      return res.status(400).json({ message: "Pincode already exists" });
    }
    
    const newPincode = new pincodedb({
      pincode: pincode.trim(),
      area: area.trim(),
      city: city.trim(),
      state: state.trim(),
      codAvailable: codAvailable !== undefined ? codAvailable : true,
      deliveryCharge: deliveryCharge || 0,
      estimatedDeliveryDays: estimatedDeliveryDays || 3,
      addedBy: adminId
    });
    
    await newPincode.save();
    
    res.status(201).json({
      message: "Pincode added successfully",
      pincode: newPincode
    });
    
  } catch (error) {
    console.error('Add pincode error:', error);
    res.status(500).json({ message: "Failed to add pincode", error: error.message });
  }
});

// ✅ 2. Get all pincodes (Admin only)
router.get("/admin/all", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const codOnly = req.query.codOnly === 'true';
    
    let filter = {};
    
    if (search) {
      filter.$or = [
        { pincode: { $regex: search, $options: 'i' } },
        { area: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { state: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (codOnly) {
      filter.codAvailable = true;
      filter.active = true;
    }
    
    const pincodes = await pincodedb.find(filter)
      .populate('addedBy', 'fname email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const totalPincodes = await pincodedb.countDocuments(filter);
    
    // Get statistics
    const stats = {
      total: await pincodedb.countDocuments({ active: true }),
      codEnabled: await pincodedb.countDocuments({ codAvailable: true, active: true }),
      codDisabled: await pincodedb.countDocuments({ codAvailable: false, active: true })
    };
    
    res.json({
      pincodes,
      currentPage: page,
      totalPages: Math.ceil(totalPincodes / limit),
      totalPincodes,
      stats
    });
    
  } catch (error) {
    console.error('Get pincodes error:', error);
    res.status(500).json({ message: "Failed to fetch pincodes", error: error.message });
  }
});

// ✅ 3. Update pincode (Admin only)
router.patch("/admin/update/:id", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.addedBy;
    delete updates.createdAt;
    
    const updatedPincode = await pincodedb.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('addedBy', 'fname email');
    
    if (!updatedPincode) {
      return res.status(404).json({ message: "Pincode not found" });
    }
    
    res.json({
      message: "Pincode updated successfully",
      pincode: updatedPincode
    });
    
  } catch (error) {
    console.error('Update pincode error:', error);
    res.status(500).json({ message: "Failed to update pincode", error: error.message });
  }
});

// ✅ 4. Delete/Deactivate pincode (Admin only)
router.delete("/admin/delete/:id", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query;
    
    if (permanent === 'true') {
      // Permanently delete
      const deletedPincode = await pincodedb.findByIdAndDelete(id);
      
      if (!deletedPincode) {
        return res.status(404).json({ message: "Pincode not found" });
      }
      
      res.json({ message: "Pincode deleted permanently" });
    } else {
      // Just deactivate
      const updatedPincode = await pincodedb.findByIdAndUpdate(
        id,
        { active: false, updatedAt: new Date() },
        { new: true }
      );
      
      if (!updatedPincode) {
        return res.status(404).json({ message: "Pincode not found" });
      }
      
      res.json({ message: "Pincode deactivated successfully" });
    }
    
  } catch (error) {
    console.error('Delete pincode error:', error);
    res.status(500).json({ message: "Failed to delete pincode", error: error.message });
  }
});

// ✅ 5. Bulk upload pincodes (Admin only)
router.post("/admin/bulk-upload", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { pincodes } = req.body; // Array of pincode objects
    const adminId = req.rootUser._id;
    
    if (!Array.isArray(pincodes) || pincodes.length === 0) {
      return res.status(400).json({ message: "Invalid pincodes data" });
    }
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };
    
    for (const pincodeData of pincodes) {
      try {
        // Check if pincode already exists
        const existingPincode = await pincodedb.findOne({ pincode: pincodeData.pincode?.trim() });
        
        if (existingPincode) {
          results.failed++;
          results.errors.push(`Pincode ${pincodeData.pincode} already exists`);
          continue;
        }
        
        const newPincode = new pincodedb({
          pincode: pincodeData.pincode?.trim(),
          area: pincodeData.area?.trim(),
          city: pincodeData.city?.trim(),
          state: pincodeData.state?.trim(),
          codAvailable: pincodeData.codAvailable !== undefined ? pincodeData.codAvailable : true,
          deliveryCharge: pincodeData.deliveryCharge || 0,
          estimatedDeliveryDays: pincodeData.estimatedDeliveryDays || 3,
          addedBy: adminId
        });
        
        await newPincode.save();
        results.successful++;
        
      } catch (error) {
        results.failed++;
        results.errors.push(`Pincode ${pincodeData.pincode}: ${error.message}`);
      }
    }
    
    res.json({
      message: `Bulk upload completed. ${results.successful} successful, ${results.failed} failed`,
      results
    });
    
  } catch (error) {
    console.error('Bulk upload pincodes error:', error);
    res.status(500).json({ message: "Failed to bulk upload pincodes", error: error.message });
  }
});

// ✅ 6. Check delivery availability (Public)
router.get("/check/:pincode", async (req, res) => {
  try {
    const { pincode } = req.params;
    
    const pincodeData = await pincodedb.findOne({ 
      pincode: pincode.trim(), 
      active: true 
    });
    
    if (!pincodeData) {
      return res.json({
        available: false,
        message: "Delivery not available to this pincode"
      });
    }
    
    res.json({
      available: true,
      codAvailable: pincodeData.codAvailable,
      deliveryCharge: pincodeData.deliveryCharge,
      estimatedDeliveryDays: pincodeData.estimatedDeliveryDays,
      area: pincodeData.area,
      city: pincodeData.city,
      state: pincodeData.state
    });
    
  } catch (error) {
    console.error('Check pincode error:', error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;