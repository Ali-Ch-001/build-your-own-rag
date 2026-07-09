"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Auth0Client,
  type User,
} from "@auth0/auth0-spa-js";
import { registerAccessTokenProvider } from "@/lib/auth-token";

interface AuthState {
  configured: boolean;
  loading: boolean;
  authenticated: boolean;
  user?: User;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  configured: false,
  loading: false,
  authenticated: false,
  login: async () => undefined,
  logout: async () => undefined,
});

const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE;

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(domain && clientId && audience);
  const clientRef = useRef<Auth0Client | null>(null);
  const [loading, setLoading] = useState(configured);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<User>();

  useEffect(() => {
    if (!configured || !domain || !clientId || !audience) return;
    let active = true;
    const auth0 = new Auth0Client({
      domain,
      clientId,
      authorizationParams: {
        audience,
        redirect_uri: window.location.origin,
      },
      cacheLocation: "memory",
      useRefreshTokens: true,
      useRefreshTokensFallback: true,
    });
    clientRef.current = auth0;
    registerAccessTokenProvider(async () =>
      auth0.getTokenSilently({ authorizationParams: { audience } }),
    );
    void (async () => {
      try {
        if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
          await auth0.handleRedirectCallback();
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        const signedIn = await auth0.isAuthenticated();
        if (!active) return;
        setAuthenticated(signedIn);
        setUser(signedIn ? await auth0.getUser() : undefined);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      clientRef.current = null;
      registerAccessTokenProvider(null);
    };
  }, [configured]);

  async function login() {
    if (!clientRef.current) return;
    await clientRef.current.loginWithRedirect({
      authorizationParams: { audience, redirect_uri: window.location.origin },
      appState: { returnTo: window.location.pathname },
    });
  }

  async function logout() {
    if (!clientRef.current) return;
    await clientRef.current.logout({ logoutParams: { returnTo: window.location.origin } });
  }

  return (
    <AuthContext.Provider
      value={{ configured, loading, authenticated, user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
