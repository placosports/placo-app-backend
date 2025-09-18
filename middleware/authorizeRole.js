const authorizeRole = (requiredRole) => {
  return (req, res, next) => {
    // Ensure req.rootUser exists (set by authenticate middleware)
    if (!req.rootUser) {
      return res.status(401).json({ 
        status: 401, 
        message: "Authentication required before role verification" 
      });
    }
    
    // Check if user has the required role
    if (req.rootUser.role !== requiredRole) {
      return res.status(403).json({ 
        status: 403, 
        message: `Access denied: ${requiredRole} role required` 
      });
    }
    
    next();
  };
};

module.exports = authorizeRole;