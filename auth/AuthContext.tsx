import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { db } from '../db/db';
import { User, UserRole } from '../types';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      // Force sign-out on app start to ensure Login Page is shown first
      await supabase.auth.signOut();
      setCurrentUser(null);
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // We only handle SIGNED_OUT here to clear state.
      // SIGNED_IN is handled explicitly by the login function to ensure sequential loading.
      if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (userId: string, email?: string) => {
    // STRICT ONLINE-FIRST LOGIN POLICY
    if (!navigator.onLine) {
      throw new Error("Internet connection required for login.");
    }

    // Fetch profile directly from Supabase.
    let { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // Use maybeSingle to avoid 406/JSON error on 0 rows

    // If profile is missing, create one JIT
    if (!profile && (!error || error.code === 'PGRST116')) {
      const newProfile = {
        id: userId,
        username: email ? email.split('@')[0] : 'User',
        role: UserRole.CASHIER, // Corrected from 'staff' to valid UserRole
        updated_at: new Date().toISOString()
      };

      const { data: insertedProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert(newProfile)
        .select()
        .single();

      if (insertError) {
        console.error("Failed to create new profile:", insertError);
        throw new Error("Failed to create user profile.");
      }
      profile = insertedProfile;
    } else if (error) {
      throw error;
    }

    if (profile) {
      let user: User = {
        supabase_id: profile.id,
        username: profile.username || email || 'User',
        role: profile.role as UserRole,
        updated_at: profile.updated_at
      };

      // Save to local DB so the user can continue working offline *after* this initial successful login session
      const localUser = await db.users.where('supabase_id').equals(userId).first();
      if (localUser) {
        await db.users.update(localUser.id!, { ...user });
        user = { ...user, id: localUser.id };
      } else {
        const newId = await db.users.add(user);
        user = { ...user, id: newId };
      }
      
      setCurrentUser(user);
    } else {
      throw new Error("Profile not found.");
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Authenticate with Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        // 2. Explicitly load user profile and wait for it to complete
        await loadUserProfile(data.user.id, data.user.email);
        return { success: true };
      } else {
        return { success: false, error: "Authentication successful but no user data returned." };
      }

    } catch (err: any) {
      console.error("Login process failed:", err);
      // If profile load fails, force sign out to clean up the session
      await supabase.auth.signOut();
      setCurrentUser(null);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    sessionStorage.removeItem('currentUser'); // Clear any legacy storage
  };

  const changePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      console.error("Password change failed:", err);
      return { success: false, error: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};