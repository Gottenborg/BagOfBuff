import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Badge, Button, Card, Field, Input, Loading, Text } from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { apiErrorMessage } from "../lib/errors";
import { formatDate } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/admins")({ component: AdminsRoute });

function AdminsRoute() {
  return (
    <AdminShell subtitle="Who can use the back office.">
      <Admins />
    </AdminShell>
  );
}

function Admins() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const { data: admins, isLoading, isError, error } = useQuery({
    queryKey: ["admins"],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/admin/admins/", {});
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not load administrators."),
        );
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/admin/admins/", {
        body: { userId: userId.trim(), email: email.trim() || null },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not grant access."),
        );
    },
    onSuccess: () => {
      setUserId("");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admins"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE("/admin/admins/{userId}", {
        params: { path: { userId: id } },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not revoke access."),
        );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admins"] }),
  });

  return (
    <>
      <Text muted className="mb-6 block text-sm">
        Anyone listed here has full access to orders, customers and the
        catalogue. Access is granted by <strong>Supabase user id</strong>, not
        email — the id is what the login token carries, so granting by email
        would either silently do nothing or hand access to whoever registers
        that address later. The person must sign up first; find their id in
        Supabase → Authentication → Users.
      </Text>

      <Card className="mb-8">
        <form
          className="flex flex-wrap items-start gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Field
            label="Supabase user id"
            htmlFor="admin-user-id"
            className="w-96"
            hint="e.g. 8f3a1c2e-… from Authentication → Users"
          >
            <Input
              id="admin-user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Email"
            htmlFor="admin-email"
            className="w-72"
            hint="Shown here and in order history"
          >
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <div className="pt-[1.375rem]">
            <Button type="submit" disabled={add.isPending || !userId.trim()}>
              {add.isPending ? "Granting…" : "Grant access"}
            </Button>
          </div>
        </form>
        {add.isError && (
          <Text className="px-5 pb-4 text-sm text-danger">
            {add.error.message}
          </Text>
        )}
      </Card>

      {isLoading && <Loading />}
      {isError && (
        <Text className="text-danger">
          {error instanceof Error ? error.message : "Could not load."}
        </Text>
      )}

      {admins && (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-subtle/60 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">User id</th>
                <th className="px-4 py-2.5 font-semibold">Added</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr
                  key={a.userId}
                  className="border-b border-subtle last:border-0"
                >
                  <td className="px-4 py-2.5 font-medium">
                    {a.email ?? "—"}{" "}
                    {a.isSelf && <Badge variant="brand">you</Badge>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    {a.userId}
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {formatDate(a.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {a.isSelf ? (
                      // Removing yourself is how someone locks themselves out.
                      <Text muted className="text-xs">
                        Ask another admin to remove you
                      </Text>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={remove.isPending || admins.length <= 1}
                        onClick={() => remove.mutate(a.userId)}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {remove.isError && (
        <Text className="mt-3 text-sm text-danger">{remove.error.message}</Text>
      )}
    </>
  );
}
