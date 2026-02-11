import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit2, Code, UserCog } from "lucide-react";

export const DeveloperResourcesManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    user_id: "",
    name: "",
    timezone: "Asia/Karachi",
    availability_calendar_id: "",
    is_active: true,
    round_robin_position: 1,
  });

  const { data: developers, isLoading } = useQuery({
    queryKey: ["admin-developers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developers")
        .select("*, availability_calendars(name)")
        .order("round_robin_position");
      if (error) throw error;
      return data;
    },
  });

  const { data: calendars } = useQuery({
    queryKey: ["availability-calendars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_calendars")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Get developer-role users who aren't yet in the developers table
  const { data: availableUsers } = useQuery({
    queryKey: ["available-developer-users", developers],
    queryFn: async () => {
      const { data: devRoles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "developer");
      if (rolesErr) throw rolesErr;

      const existingUserIds = new Set(developers?.map((d: any) => d.user_id) || []);
      const unregisteredIds = (devRoles || [])
        .map((r: any) => r.user_id)
        .filter((id: string) => !existingUserIds.has(id));

      if (unregisteredIds.length === 0) return [];

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", unregisteredIds);
      if (profErr) throw profErr;
      return profiles || [];
    },
    enabled: !!developers,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      const payload = {
        user_id: data.user_id,
        name: data.name,
        timezone: data.timezone,
        availability_calendar_id: data.availability_calendar_id,
        is_active: data.is_active,
        round_robin_position: data.round_robin_position,
      };
      if (data.id) {
        const { user_id: _, ...updatePayload } = payload;
        const { error } = await supabase
          .from("developers")
          .update(updatePayload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("developers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-developers"] });
      queryClient.invalidateQueries({ queryKey: ["available-developer-users"] });
      toast({ title: editingId ? "Developer updated" : "Developer registered" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("developers")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-developers"] });
      toast({ title: "Developer status updated" });
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditingId(null);
    setFormData({
      user_id: "",
      name: "",
      timezone: "Asia/Karachi",
      availability_calendar_id: "",
      is_active: true,
      round_robin_position: (developers?.length || 0) + 1,
    });
  };

  const openEdit = (dev: any) => {
    setEditingId(dev.id);
    setFormData({
      user_id: dev.user_id,
      name: dev.name,
      timezone: dev.timezone,
      availability_calendar_id: dev.availability_calendar_id,
      is_active: dev.is_active,
      round_robin_position: dev.round_robin_position,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.availability_calendar_id) {
      toast({ variant: "destructive", title: "Name and calendar are required" });
      return;
    }
    if (!editingId && !formData.user_id) {
      toast({ variant: "destructive", title: "Please select a user" });
      return;
    }
    saveMutation.mutate({ ...formData, id: editingId || undefined });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          Developer Configuration
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Register Developer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Developer" : "Register Developer"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!editingId && (
                <div>
                  <Label>User</Label>
                  <Select
                    value={formData.user_id}
                    onValueChange={(val) => {
                      const user = availableUsers?.find((u: any) => u.id === val);
                      setFormData((p) => ({
                        ...p,
                        user_id: val,
                        name: user?.full_name || user?.email || p.name,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select developer user" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers?.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Display Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input
                  value={formData.timezone}
                  onChange={(e) => setFormData((p) => ({ ...p, timezone: e.target.value }))}
                />
              </div>
              <div>
                <Label>Availability Calendar</Label>
                <Select
                  value={formData.availability_calendar_id}
                  onValueChange={(val) => setFormData((p) => ({ ...p, availability_calendar_id: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select calendar" />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars?.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Round Robin Position</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.round_robin_position}
                  onChange={(e) => setFormData((p) => ({ ...p, round_robin_position: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData((p) => ({ ...p, is_active: checked }))}
                />
                <Label>Active</Label>
              </div>
              <Button onClick={handleSubmit} disabled={saveMutation.isPending} className="w-full">
                {saveMutation.isPending ? "Saving..." : editingId ? "Update Developer" : "Register Developer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !developers?.length ? (
          <p className="text-sm text-muted-foreground">No developers registered yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pos</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Calendar</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {developers.map((dev: any) => (
                <TableRow key={dev.id}>
                  <TableCell className="font-mono">{dev.round_robin_position}</TableCell>
                  <TableCell className="font-medium">{dev.name}</TableCell>
                  <TableCell className="text-sm">{dev.timezone}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {(dev as any).availability_calendars?.name || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={dev.is_active}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({ id: dev.id, is_active: checked })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(dev)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
