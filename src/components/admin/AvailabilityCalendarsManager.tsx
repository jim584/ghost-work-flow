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
import { Plus, Edit2, Trash2, Clock, Globe } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const AvailabilityCalendarsManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    timezone: "Asia/Karachi",
    working_days: [1, 2, 3, 4, 5, 6] as number[],
    start_time: "10:00",
    end_time: "19:00",
    saturday_start_time: "10:00",
    saturday_end_time: "15:00",
  });

  const { data: calendars, isLoading } = useQuery({
    queryKey: ["availability-calendars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_calendars")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Check which calendars are in use
  const { data: usedCalendarIds } = useQuery({
    queryKey: ["used-calendar-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developers")
        .select("availability_calendar_id");
      if (error) throw error;
      return new Set(data?.map((d: any) => d.availability_calendar_id) || []);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      const payload = {
        name: data.name,
        timezone: data.timezone,
        working_days: data.working_days,
        start_time: data.start_time,
        end_time: data.end_time,
        saturday_start_time: data.saturday_start_time,
        saturday_end_time: data.saturday_end_time,
      };
      if (data.id) {
        const { error } = await supabase
          .from("availability_calendars")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("availability_calendars")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-calendars"] });
      toast({ title: editingId ? "Calendar updated" : "Calendar created" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("availability_calendars")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability-calendars"] });
      toast({ title: "Calendar deleted" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Cannot delete", description: "Calendar is in use by developers." });
    },
  });

  const resetForm = () => {
    setDialogOpen(false);
    setEditingId(null);
    setFormData({
      name: "",
      timezone: "Asia/Karachi",
      working_days: [1, 2, 3, 4, 5, 6],
      start_time: "10:00",
      end_time: "19:00",
      saturday_start_time: "10:00",
      saturday_end_time: "15:00",
    });
  };

  const openEdit = (cal: any) => {
    setEditingId(cal.id);
    setFormData({
      name: cal.name,
      timezone: cal.timezone,
      working_days: cal.working_days,
      start_time: cal.start_time?.substring(0, 5) || "10:00",
      end_time: cal.end_time?.substring(0, 5) || "19:00",
      saturday_start_time: cal.saturday_start_time?.substring(0, 5) || "10:00",
      saturday_end_time: cal.saturday_end_time?.substring(0, 5) || "15:00",
    });
    setDialogOpen(true);
  };

  const toggleDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      working_days: prev.working_days.includes(day)
        ? prev.working_days.filter((d) => d !== day)
        : [...prev.working_days, day].sort(),
    }));
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    saveMutation.mutate({ ...formData, id: editingId || undefined });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Availability Calendars
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Calendar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Calendar" : "Create Calendar"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Standard PK Shift"
                />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input
                  value={formData.timezone}
                  onChange={(e) => setFormData((p) => ({ ...p, timezone: e.target.value }))}
                  placeholder="Asia/Karachi"
                />
              </div>
              <div>
                <Label>Working Days</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <label key={day} className="flex items-center gap-1 text-sm">
                      <Checkbox
                        checked={formData.working_days.includes(day)}
                        onCheckedChange={() => toggleDay(day)}
                      />
                      {DAY_NAMES[day]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time (Mon–Fri)</Label>
                  <Input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData((p) => ({ ...p, start_time: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>End Time (Mon–Fri)</Label>
                  <Input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData((p) => ({ ...p, end_time: e.target.value }))}
                  />
                </div>
              </div>
              {formData.working_days.includes(6) && (
                <div className="grid grid-cols-2 gap-4 border-t pt-3">
                  <div>
                    <Label>Saturday Start Time</Label>
                    <Input
                      type="time"
                      value={formData.saturday_start_time}
                      onChange={(e) => setFormData((p) => ({ ...p, saturday_start_time: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Saturday End Time</Label>
                    <Input
                      type="time"
                      value={formData.saturday_end_time}
                      onChange={(e) => setFormData((p) => ({ ...p, saturday_end_time: e.target.value }))}
                    />
                  </div>
                </div>
              )}
              <Button onClick={handleSubmit} disabled={saveMutation.isPending} className="w-full">
                {saveMutation.isPending ? "Saving..." : editingId ? "Update Calendar" : "Create Calendar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !calendars?.length ? (
          <p className="text-sm text-muted-foreground">No calendars created yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Working Days</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendars.map((cal: any) => (
                <TableRow key={cal.id}>
                  <TableCell className="font-medium">{cal.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Globe className="h-3 w-3" />
                      {cal.timezone}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(cal.working_days || []).map((d: number) => (
                        <Badge key={d} variant="secondary" className="text-xs">
                          {DAY_NAMES[d]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{cal.start_time?.substring(0, 5)} - {cal.end_time?.substring(0, 5)}</div>
                    {(cal.working_days || []).includes(6) && cal.saturday_start_time && (
                      <div className="text-xs text-muted-foreground">
                        Sat: {cal.saturday_start_time?.substring(0, 5)} - {cal.saturday_end_time?.substring(0, 5)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cal)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={usedCalendarIds?.has(cal.id)}
                        onClick={() => deleteMutation.mutate(cal.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
