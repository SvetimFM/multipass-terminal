const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL',
  process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'
);

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// User tiers
const USER_TIERS = {
  FREE: {
    projects: 1,
    cubiclesPerProject: 3,
    storageGB: 2,
    aiModes: ['basic', 'code_writer', 'debugger']
  },
  PRO: {
    projects: -1, // unlimited
    cubiclesPerProject: -1, // unlimited
    storageGB: -1, // unlimited for desktop
    aiModes: 'all'
  },
  TEAM: {
    projects: -1,
    cubiclesPerProject: -1,
    storageGB: -1,
    aiModes: 'all',
    features: ['collaboration', 'sharing', 'admin']
  }
};

// Authentication middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Check user limits
async function checkUserLimits(userId, resource, count = 1) {
  const { data: user, error } = await supabase
    .from('users')
    .select('tier, usage')
    .eq('id', userId)
    .single();
    
  if (error) return false;
  
  const tier = USER_TIERS[user.tier || 'FREE'];
  const usage = user.usage || {};
  
  switch (resource) {
    case 'projects':
      return tier.projects === -1 || (usage.projects || 0) + count <= tier.projects;
    case 'cubicles':
      return tier.cubiclesPerProject === -1 || count <= tier.cubiclesPerProject;
    case 'storage':
      return tier.storageGB === -1 || (usage.storageGB || 0) + count <= tier.storageGB;
    default:
      return false;
  }
}

// Sign up new user
async function signUp(email, password, name) {
  try {
    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });
    
    if (authError) throw authError;
    
    // Create user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        name,
        tier: 'FREE',
        usage: { projects: 0, storageGB: 0 },
        created_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (profileError) throw profileError;
    
    // Generate JWT
    const token = jwt.sign(
      { id: authData.user.id, email, tier: 'FREE' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    return { user: profile, token };
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
}

// Sign in user
async function signIn(email, password) {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (authError) throw authError;
    
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();
      
    if (profileError) throw profileError;
    
    // Generate JWT
    const token = jwt.sign(
      { id: authData.user.id, email, tier: profile.tier },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    return { user: profile, token };
  } catch (error) {
    console.error('Signin error:', error);
    throw error;
  }
}

// Update user usage
async function updateUsage(userId, resource, delta) {
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('usage')
    .eq('id', userId)
    .single();
    
  if (fetchError) throw fetchError;
  
  const usage = user.usage || {};
  usage[resource] = (usage[resource] || 0) + delta;
  
  const { error: updateError } = await supabase
    .from('users')
    .update({ usage })
    .eq('id', userId);
    
  if (updateError) throw updateError;
}

module.exports = {
  supabase,
  authMiddleware,
  checkUserLimits,
  signUp,
  signIn,
  updateUsage,
  USER_TIERS
};