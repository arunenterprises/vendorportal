import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

// Auth probe: never throws into the tree — an unauthenticated visitor just gets user = null.
export function useAuth() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await apiGet("/auth/me");
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 30_000,
  });
  return { user: data ?? null, isLoading, isError };
}
