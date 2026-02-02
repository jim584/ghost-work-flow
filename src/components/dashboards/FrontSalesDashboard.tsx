import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Plus, Clock, FolderKanban, Trash2, Globe, User, Mail, Phone, DollarSign, Calendar, Users, Image, Palette, FileText, Eye } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { CreateTaskForm } from "./CreateTaskForm";
import { CreateLogoOrderForm } from "./CreateLogoOrderForm";
import { CreateWebsiteOrderForm } from "./CreateWebsiteOrderForm";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, subDays, isAfter } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const FrontSalesDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [taskType, setTaskType] = useState<"social_media" | "logo" | "website" | null>(null);
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch designer teams only (exclude developer-only teams) for logo/social media orders
  const { data: designerTeams } = useQuery({
    queryKey: ["designer-teams"],
    queryFn: async () => {
      const { data: designerRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "designer");
      
      if (rolesError) throw rolesError;
      
      const designerUserIds = designerRoles?.map(r => r.user_id) || [];
      
      if (designerUserIds.length === 0) return [];
      
      const { data: designerTeamMembers, error: membersError } = await supabase
        .from("team_members")
        .select("team_id")
        .in("user_id", designerUserIds);
      
      if (membersError) throw membersError;
      
      const designerTeamIds = [...new Set(designerTeamMembers?.map(m => m.team_id) || [])];
      
      if (designerTeamIds.length === 0) return [];
      
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .in("id", designerTeamIds);
      
      if (teamsError) throw teamsError;
      return teamsData;
    },
  });

  // Fetch developer profiles for website orders
  const { data: developerProfiles } = useQuery({
    queryKey: ["developer-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          team_id,
          user_id,
          profiles!team_members_user_id_fkey(id, full_name, email)
        `);
      if (error) throw error;
      return data;
    },
  });

  const getDeveloperForTeam = (teamId: string) => {
    const member = developerProfiles?.find(m => m.team_id === teamId);
    if (member?.profiles) {
      const profile = member.profiles as any;
      return profile.full_name || profile.email || "Unknown";
    }
    return null;
  };

  // Front Sales can view all tasks (RLS policy allows this)
  const { data: myTasks } = useQuery({
    queryKey: ["sales-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Query for all tasks (used when searching)
  const { data: allTasks } = useQuery({
    queryKey: ["all-tasks-search", searchQuery],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name), profiles!tasks_project_manager_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!searchQuery.trim(),
  });

  const tasks = searchQuery.trim() ? allTasks : myTasks;

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-tasks"] });
      toast({ title: "Task deleted successfully" });
      setDeleteTaskId(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error deleting task",
        description: error.message,
      });
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = {
    delayed: tasks?.filter(t => 
      t.deadline && new Date(t.deadline) < today && 
      !['completed', 'approved'].includes(t.status)
    ).length || 0,
    pending: tasks?.filter(t => t.status === 'pending').length || 0,
    in_progress: tasks?.filter(t => t.status === 'in_progress').length || 0,
    completed: tasks?.filter(t => t.status === 'completed' || t.status === 'approved').length || 0,
    total: tasks?.length || 0,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-muted text-muted-foreground";
      case "in_progress":
        return "bg-warning text-warning-foreground";
      case "completed":
        return "bg-primary text-primary-foreground";
      case "approved":
        return "bg-success text-success-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const isLogoOrder = (task: any) => task?.post_type === "Logo Design";
  const isWebsiteOrder = (task: any) => task?.post_type === "Website Design";

  const filteredTasks = tasks?.filter((task) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = task.title?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.business_name?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        `#${task.task_number}`.includes(query);
      
      if (orderTypeFilter) {
        const matchesOrderType = 
          (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
          (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
          (orderTypeFilter === 'website' && task.post_type === 'Website Design');
        return matchesSearch && matchesOrderType;
      }
      return matchesSearch;
    }
    
    if (orderTypeFilter) {
      const matchesOrderType = 
        (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
        (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
        (orderTypeFilter === 'website' && task.post_type === 'Website Design');
      if (!matchesOrderType) return false;
    }
    
    if (!statusFilter || statusFilter === 'all') return true;
    if (statusFilter === 'delayed') {
      return task.deadline && new Date(task.deadline) < today && !['completed', 'approved'].includes(task.status);
    }
    return task.status === statusFilter;
  }).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());

  const getOrderTypeIcon = (task: any) => {
    if (isWebsiteOrder(task)) return <Globe className="h-5 w-5 text-blue-500" />;
    if (isLogoOrder(task)) return <Palette className="h-5 w-5 text-purple-500" />;
    return <Image className="h-5 w-5 text-pink-500" />;
  };

  const getOrderTypeBadge = (task: any) => {
    if (isWebsiteOrder(task)) return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">Website</Badge>;
    if (isLogoOrder(task)) return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">Logo</Badge>;
    return <Badge variant="outline" className="bg-pink-500/10 text-pink-600 border-pink-200">Social Media</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Front Sales Dashboard</h1>
          <Button onClick={signOut} variant="outline" size="sm">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search by task #, title, business name, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>
        
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('all')}
            >
              All Tasks
            </Button>
            <Button
              variant={statusFilter === 'delayed' ? 'default' : 'outline'}
              onClick={() => setStatusFilter('delayed')}
              className="text-red-600"
            >
              Delayed
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant={!orderTypeFilter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter(null)}
            >
              All Types
            </Button>
            <Button
              variant={orderTypeFilter === 'logo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('logo')}
            >
              <FileText className="h-4 w-4 mr-1" />
              Logo
            </Button>
            <Button
              variant={orderTypeFilter === 'social_media' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('social_media')}
            >
              <FolderKanban className="h-4 w-4 mr-1" />
              Social Media
            </Button>
            <Button
              variant={orderTypeFilter === 'website' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('website')}
            >
              <Globe className="h-4 w-4 mr-1" />
              Website
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card 
            className={`border-l-4 border-l-red-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'delayed' ? 'ring-2 ring-red-500' : ''}`}
            onClick={() => setStatusFilter('delayed')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delayed Orders</CardTitle>
              <Clock className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.delayed}</div>
              <p className="text-xs text-muted-foreground">Past deadline</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'pending' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Not started</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'in_progress' ? 'ring-2 ring-warning' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.in_progress}</div>
              <p className="text-xs text-muted-foreground">Being worked on</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`border-l-4 border-l-green-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'completed' ? 'ring-2 ring-green-500' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <FolderKanban className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
              <p className="text-xs text-muted-foreground">Finished orders</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Orders - Last 6 Days Status (Grouped by Customer) */}
        {(() => {
          const sixDaysAgo = subDays(new Date(), 6);
          const recentOrders = myTasks?.filter(task => 
            task.created_at && isAfter(new Date(task.created_at), sixDaysAgo)
          ).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());
          
          // Group orders by customer name + title + deadline (same order assigned to multiple teams)
          const groupedOrders = recentOrders?.reduce((acc, task) => {
            // Create a unique key based on customer, title, deadline, and post_type
            const groupKey = `${task.customer_name || task.business_name || ''}_${task.title}_${task.deadline || ''}_${task.post_type || ''}`;
            
            if (!acc[groupKey]) {
              acc[groupKey] = {
                ...task,
                teams: [(task as any).teams?.name || 'Unknown'],
                teamCount: 1,
                statuses: [task.status],
                taskNumbers: [task.task_number],
              };
            } else {
              acc[groupKey].teams.push((task as any).teams?.name || 'Unknown');
              acc[groupKey].teamCount += 1;
              acc[groupKey].statuses.push(task.status);
              acc[groupKey].taskNumbers.push(task.task_number);
            }
            return acc;
          }, {} as Record<string, any>) || {};
          
          const groupedOrdersList = Object.values(groupedOrders);
          
          // Get overall status for grouped order (worst status takes priority)
          const getOverallStatus = (statuses: string[]) => {
            if (statuses.includes('pending')) return 'pending';
            if (statuses.includes('in_progress')) return 'in_progress';
            if (statuses.includes('completed')) return 'completed';
            if (statuses.includes('approved')) return 'approved';
            return statuses[0];
          };
          
          if (groupedOrdersList.length > 0) {
            return (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="text-lg">Recent Orders (Last 6 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {groupedOrdersList.map((order: any) => (
                      <div 
                        key={order.id} 
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          {getOrderTypeIcon(order)}
                          <span className="font-medium">
                            {order.taskNumbers.length > 1 
                              ? `#${order.taskNumbers.join(', #')}` 
                              : `#${order.task_number}`}
                          </span>
                          <span className="text-muted-foreground truncate max-w-[200px]">
                            {order.customer_name || order.business_name || order.title}
                          </span>
                          {order.teamCount > 1 && (
                            <Badge variant="outline" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {order.teamCount} teams
                            </Badge>
                          )}
                        </div>
                        <Badge className={getStatusColor(getOverallStatus(order.statuses))}>
                          {getOverallStatus(order.statuses).replace('_', ' ')}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          }
          return null;
        })()}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Orders</CardTitle>
            <Dialog open={open} onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (!isOpen) setTaskType(null);
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Order
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                {!taskType ? (
                  <div className="space-y-4">
                    <DialogHeader>
                      <DialogTitle>Select Order Type</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-3 gap-4">
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("social_media")}
                      >
                        <FolderKanban className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Social Media Post</p>
                          <p className="text-xs text-muted-foreground">Create social media content</p>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("logo")}
                      >
                        <FileText className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Logo Order</p>
                          <p className="text-xs text-muted-foreground">Create logo design order</p>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("website")}
                      >
                        <Globe className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Website Order</p>
                          <p className="text-xs text-muted-foreground">Create website design order</p>
                        </div>
                      </Button>
                    </div>
                  </div>
                ) : taskType === "social_media" ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Social Media Post Request</DialogTitle>
                    </DialogHeader>
                    <CreateTaskForm 
                      userId={user!.id} 
                      teams={designerTeams || []} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                    />
                  </>
                ) : taskType === "logo" ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Logo Order</DialogTitle>
                    </DialogHeader>
                    <CreateLogoOrderForm 
                      userId={user!.id} 
                      teams={designerTeams || []} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                    />
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Website Order</DialogTitle>
                    </DialogHeader>
                    <CreateWebsiteOrderForm 
                      userId={user!.id} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                    />
                  </>
                )}
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredTasks?.map((task) => {
                const isDelayed = task.deadline && new Date(task.deadline) < today && !['completed', 'approved'].includes(task.status);
                
                return (
                  <div 
                    key={task.id} 
                    className={`group border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fade-in ${isDelayed ? 'border-l-4 border-l-red-500 bg-red-50/10' : ''}`}
                  >
                    {/* Card Header */}
                    <div className="p-4 bg-gradient-to-r from-muted/30 to-transparent border-b">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="p-2 rounded-lg bg-background shadow-sm">
                            {getOrderTypeIcon(task)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                #{task.task_number}
                              </span>
                              {getOrderTypeBadge(task)}
                              {isDelayed && <Badge className="bg-red-500 text-white">DELAYED</Badge>}
                            </div>
                            <h3 className="font-semibold text-lg mt-1 truncate">{task.title}</h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={`${getStatusColor(task.status)} shadow-sm`}>
                            {task.status.replace("_", " ")}
                          </Badge>
                          {task.status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-destructive/10"
                              onClick={() => setDeleteTaskId(task.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-4">
                      {task.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                      )}

                      {/* Info Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Customer Info */}
                        {(task.customer_name || task.customer_email || task.customer_phone) && (
                          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              <User className="h-3.5 w-3.5" />
                              Customer
                            </div>
                            <div className="space-y-1">
                              {task.customer_name && (
                                <p className="text-sm font-medium truncate">{task.customer_name}</p>
                              )}
                              {task.customer_email && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  <span className="truncate">{task.customer_email}</span>
                                </div>
                              )}
                              {task.customer_phone && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  <span>{task.customer_phone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Payment Info */}
                        {(task.amount_total || task.amount_paid || task.amount_pending) && (
                          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              <DollarSign className="h-3.5 w-3.5" />
                              Payment
                            </div>
                            <div className="space-y-1 text-sm">
                              {task.amount_total && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Total:</span>
                                  <span className="font-medium">${Number(task.amount_total).toFixed(2)}</span>
                                </div>
                              )}
                              {task.amount_paid !== null && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Paid:</span>
                                  <span className="font-medium text-green-600">${Number(task.amount_paid).toFixed(2)}</span>
                                </div>
                              )}
                              {task.amount_pending && Number(task.amount_pending) > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Pending:</span>
                                  <span className="font-medium text-orange-600">${Number(task.amount_pending).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Assignment Info */}
                        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            <Users className="h-3.5 w-3.5" />
                            Assignment
                          </div>
                          <div className="space-y-1">
                            {isWebsiteOrder(task) ? (
                              <p className="text-sm font-medium">{getDeveloperForTeam(task.team_id) || "Unassigned"}</p>
                            ) : (
                              <p className="text-sm font-medium">{(task.teams as any)?.name || "Unassigned"}</p>
                            )}
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>{format(new Date(task.created_at!), "MMM d, yyyy")}</span>
                            </div>
                            {task.deadline && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDelayed ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                                <Clock className="h-3 w-3" />
                                <span>Due: {format(new Date(task.deadline), "MMM d, yyyy")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="flex items-center justify-end pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewDetailsTask(task)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {(!filteredTasks || filteredTasks.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No orders found</p>
                  <p className="text-sm">Create your first order to get started</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* View Details Dialog */}
      <Dialog open={!!viewDetailsTask} onOpenChange={(open) => !open && setViewDetailsTask(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Order Details - #{viewDetailsTask?.task_number}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            {viewDetailsTask && (
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  {getOrderTypeBadge(viewDetailsTask)}
                  <Badge className={getStatusColor(viewDetailsTask.status)}>
                    {viewDetailsTask.status.replace("_", " ")}
                  </Badge>
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg">{viewDetailsTask.title}</h3>
                  {viewDetailsTask.description && (
                    <p className="text-muted-foreground mt-1">{viewDetailsTask.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Customer Details */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm uppercase text-muted-foreground">Customer</h4>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      {viewDetailsTask.customer_name && <p><span className="text-muted-foreground">Name:</span> {viewDetailsTask.customer_name}</p>}
                      {viewDetailsTask.customer_email && <p><span className="text-muted-foreground">Email:</span> {viewDetailsTask.customer_email}</p>}
                      {viewDetailsTask.customer_phone && <p><span className="text-muted-foreground">Phone:</span> {viewDetailsTask.customer_phone}</p>}
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm uppercase text-muted-foreground">Payment</h4>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p><span className="text-muted-foreground">Total:</span> ${Number(viewDetailsTask.amount_total || 0).toFixed(2)}</p>
                      <p><span className="text-muted-foreground">Paid:</span> <span className="text-green-600">${Number(viewDetailsTask.amount_paid || 0).toFixed(2)}</span></p>
                      <p><span className="text-muted-foreground">Pending:</span> <span className="text-orange-600">${Number(viewDetailsTask.amount_pending || 0).toFixed(2)}</span></p>
                    </div>
                  </div>

                  {/* Business Details */}
                  {(viewDetailsTask.business_name || viewDetailsTask.business_email || viewDetailsTask.business_phone) && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm uppercase text-muted-foreground">Business</h4>
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                        {viewDetailsTask.business_name && <p><span className="text-muted-foreground">Name:</span> {viewDetailsTask.business_name}</p>}
                        {viewDetailsTask.business_email && <p><span className="text-muted-foreground">Email:</span> {viewDetailsTask.business_email}</p>}
                        {viewDetailsTask.business_phone && <p><span className="text-muted-foreground">Phone:</span> {viewDetailsTask.business_phone}</p>}
                        {viewDetailsTask.industry && <p><span className="text-muted-foreground">Industry:</span> {viewDetailsTask.industry}</p>}
                      </div>
                    </div>
                  )}

                  {/* Assignment Details */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm uppercase text-muted-foreground">Assignment</h4>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      {isWebsiteOrder(viewDetailsTask) ? (
                        <p><span className="text-muted-foreground">Developer:</span> {getDeveloperForTeam(viewDetailsTask.team_id) || "Unassigned"}</p>
                      ) : (
                        <p><span className="text-muted-foreground">Team:</span> {(viewDetailsTask.teams as any)?.name || "Unassigned"}</p>
                      )}
                      <p><span className="text-muted-foreground">Created:</span> {format(new Date(viewDetailsTask.created_at!), "MMM d, yyyy")}</p>
                      {viewDetailsTask.deadline && (
                        <p><span className="text-muted-foreground">Deadline:</span> {format(new Date(viewDetailsTask.deadline), "MMM d, yyyy")}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Additional Details for specific order types */}
                {isWebsiteOrder(viewDetailsTask) && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm uppercase text-muted-foreground">Website Details</h4>
                    <div className="bg-muted/30 rounded-lg p-3 grid grid-cols-2 gap-2">
                      {viewDetailsTask.website_type && <p><span className="text-muted-foreground">Type:</span> {viewDetailsTask.website_type}</p>}
                      {viewDetailsTask.number_of_pages && <p><span className="text-muted-foreground">Pages:</span> {viewDetailsTask.number_of_pages}</p>}
                      {viewDetailsTask.website_features && <p className="col-span-2"><span className="text-muted-foreground">Features:</span> {viewDetailsTask.website_features}</p>}
                    </div>
                  </div>
                )}

                {isLogoOrder(viewDetailsTask) && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm uppercase text-muted-foreground">Logo Details</h4>
                    <div className="bg-muted/30 rounded-lg p-3 grid grid-cols-2 gap-2">
                      {viewDetailsTask.logo_type && <p><span className="text-muted-foreground">Type:</span> {viewDetailsTask.logo_type}</p>}
                      {viewDetailsTask.logo_style && <p><span className="text-muted-foreground">Style:</span> {viewDetailsTask.logo_style}</p>}
                      {viewDetailsTask.tagline && <p><span className="text-muted-foreground">Tagline:</span> {viewDetailsTask.tagline}</p>}
                      {viewDetailsTask.brand_colors && <p><span className="text-muted-foreground">Colors:</span> {viewDetailsTask.brand_colors}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTaskId} onOpenChange={(open) => !open && setDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTaskId && deleteTask.mutate(deleteTaskId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FrontSalesDashboard;