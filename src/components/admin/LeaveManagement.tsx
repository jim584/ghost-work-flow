import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, X, CalendarOff } from "lucide-react";
import { format } from "date-fns";

export const LeaveManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    developer_id: "",
    leave_start_datetime: "",
    leave_end_datetime: "",
    reason: "",
  });

  const { data: developers } = useQuery({
    queryKey: ["admin-developers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: leaves, isLoading } = useQuery({
    queryKey: ["admin-leave-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_records")
        .select("*, developers(name)")
        .order("leave_start_datetime", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("leave_records").insert({
        developer_id: data.developer_id,
        leave_start_datetime: data.leave_start_datetime,
        leave_end_datetime: data.leave_end_datetime,
        reason: data.reason || null,
        status: "approved",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-records"] });
      toast({ title: "Leave record created" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("leave_records")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-records"] });
      toast({ title: "Leave status updated" });
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setFormData({
      developer_id: "",
      leave_start_datetime: "",
      leave_end_datetime: "",
      reason: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.developer_id || !formData.leave_start_datetime || !formData.leave_end_datetime) {
      toast({ variant: "destructive", title: "Developer and dates are required" });
      return;
    }
    createMutation.mutate(formData);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "default";
      case "pending": return "secondary";
      default: return "destructive";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarOff className="h-5 w-5" />
          Leave Management
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Leave Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Developer</Label>
                <Select
                  value={formData.developer_id}
                  onValueChange={(val) => setFormData((p) => ({ ...p, developer_id: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select developer" />
                  </SelectTrigger>
                  <SelectContent>
                    {developers?.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={formData.leave_start_datetime}
                  onChange={(e) => setFormData((p) => ({ ...p, leave_start_datetime: e.target.value }))}
                />
              </div>
              <div>
                <Label>End Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={formData.leave_end_datetime}
                  onChange={(e) => setFormData((p) => ({ ...p, leave_end_datetime: e.target.value }))}
                />
              </div>
              <div>
                <Label>Reason (optional)</Label>
                <Textarea
                  value={formData.reason}
                  onChange={(e) => setFormData((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Reason for leave"
                />
              </div>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? "Saving..." : "Create Leave (Auto-Approved)"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !leaves?.length ? (
          <p className="text-sm text-muted-foreground">No leave records.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Developer</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaves.map((leave: any) => (
                <TableRow key={leave.id}>
                  <TableCell className="font-medium">
                    {(leave as any).developers?.name || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(leave.leave_start_datetime), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(leave.leave_end_datetime), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">
                    {leave.reason || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(leave.status) as any}>
                      {leave.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {leave.status === "pending" && (
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateStatusMutation.mutate({ id: leave.id, status: "approved" })}
                        >
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateStatusMutation.mutate({ id: leave.id, status: "rejected" })}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
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
