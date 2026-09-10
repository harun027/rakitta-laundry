"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Role } from "@/types";

export interface OutletInfo {
  id: string;
  name: string;
  code: string;
  timezone: string;
}

export interface TenantMembership {
  tenant_id: string;
  tenant_name: string;
  role: Role;
  outlets: OutletInfo[];
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
}

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: UserProfile | null;
  memberships: TenantMembership[];
  activeMembership: TenantMembership | null;
  activeOutlet: OutletInfo | null;
  role: Role;
  setActiveOutlet: (outlet: OutletInfo) => void;
  setActiveTenant: (tenantId: string) => void;
  refreshContext: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_OUTLET: OutletInfo = {
  id: "out_sby_main",
  name: "Outlet Surabaya (Pusat)",
  code: "SBY01",
  timezone: "Asia/Jakarta",
};

const DEFAULT_MEMBERSHIP: TenantMembership = {
  tenant_id: "tenant_main",
  tenant_name: "LaundryFlow Mandiri",
  role: "owner",
  outlets: [DEFAULT_OUTLET],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([DEFAULT_MEMBERSHIP]);
  const [activeMembership, setActiveMembership] = useState<TenantMembership | null>(DEFAULT_MEMBERSHIP);
  const [activeOutlet, setActiveOutletState] = useState<OutletInfo | null>(DEFAULT_OUTLET);

  const supabase = createClient();

  const refreshContext = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);
      // Fetch session context from RPC
      const { data: ctx, error } = await supabase.rpc("get_my_context");

      if (!error && ctx?.authenticated) {
        setUser(ctx.user);
        const mems: TenantMembership[] = ctx.memberships || [];
        setMemberships(mems);

        if (mems.length > 0) {
          const firstMem = mems[0];
          setActiveMembership(firstMem);
          if (firstMem.outlets?.length > 0) {
            setActiveOutletState(firstMem.outlets[0]);
          }
        }
      } else {
        // Fallback user details from Auth
        setUser({
          id: authData.user.id,
          email: authData.user.email || "",
          full_name: authData.user.user_metadata?.full_name || "Staff Laundry",
        });
      }
    } catch {
      // In offline or preview mode, retain default state
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    refreshContext();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshContext();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refreshContext, supabase]);

  const setActiveOutlet = (outlet: OutletInfo) => {
    setActiveOutletState(outlet);
  };

  const setActiveTenant = (tenantId: string) => {
    const mem = memberships.find((m) => m.tenant_id === tenantId);
    if (mem) {
      setActiveMembership(mem);
      if (mem.outlets?.length > 0) {
        setActiveOutletState(mem.outlets[0]);
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setUser(null);
    window.location.href = "/login";
  };

  const role = activeMembership?.role || "cashier";

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        user,
        memberships,
        activeMembership,
        activeOutlet,
        role,
        setActiveOutlet,
        setActiveTenant,
        refreshContext,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
