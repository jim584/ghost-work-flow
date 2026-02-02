import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Plus, Clock, FolderKanban, Trash2, Globe, User, Mail, Phone, DollarSign, Calendar, Users, Image, Palette, FileText, Eye, ChevronDown, ChevronRight, Download } from "lucide-react";
import { FilePreview } from "@/components/FilePreview";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { CreateTaskForm } from "./CreateTaskForm";
import { CreateLogoOrderForm } from "./CreateLogoOrderForm";
import { CreateWebsiteOrderForm } from "./CreateWebsiteOrderForm";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, subDays, isAfter, startOfWeek, startOfMonth } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [orderTypeFilter, setOrderTypeFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // Fetch my own orders (created by me) for the main dashboard
  const { data: myTasks } = useQuery({
    queryKey: ["sales-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name), project_manager:profiles!tasks_project_manager_id_fkey(full_name, email)")
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch sales target for the current user
  const { data: salesTarget } = useQuery({
    queryKey: ["sales-target", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("monthly_order_target, transferred_orders_count, closed_orders_count")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Query for all tasks (used when searching) - can search all orders in the system
  const { data: allTasks } = useQuery({
    queryKey: ["all-tasks-search", searchQuery],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name), project_manager:profiles!tasks_project_manager_id_fkey(full_name, email)")
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

  const threeDaysAgo = subDays(new Date(), 3);

  const filteredTasks = tasks?.filter((task) => {
    // Filter by 3 days OR completed/approved status (for My Orders section)
    const isWithin3Days = task.created_at && isAfter(new Date(task.created_at), threeDaysAgo);
    const isCompleted = task.status === 'completed' || task.status === 'approved';
    const passesTimeFilter = isWithin3Days || isCompleted;
    
    // When searching, don't apply the time filter (allow searching all orders)
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
    
    // Apply time filter only when not searching
    if (!passesTimeFilter) return false;
    
    if (orderTypeFilter) {
      const matchesOrderType = 
        (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
        (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
        (orderTypeFilter === 'website' && task.post_type === 'Website Design');
      if (!matchesOrderType) return false;
    }
    
    return true;
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
        {/* Stats Summary Cards */}
        {(() => {
          const now = new Date();
          const weekStart = startOfWeek(now, { weekStartsOn: 1 });
          const monthStart = startOfMonth(now);
          
          // Group tasks to get unique orders (same order can be assigned to multiple teams)
          const getUniqueOrders = (tasks: typeof myTasks) => {
            if (!tasks) return [];
            const seen = new Set<string>();
            return tasks.filter(task => {
              const key = `${task.customer_name || task.business_name || ''}_${task.title}_${task.deadline || ''}_${task.post_type || ''}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          };
          
          const uniqueOrders = getUniqueOrders(myTasks);
          const totalOrders = uniqueOrders.length;
          const ordersThisWeek = getUniqueOrders(myTasks?.filter(t => t.created_at && new Date(t.created_at) >= weekStart)).length;
          const ordersThisMonth = getUniqueOrders(myTasks?.filter(t => t.created_at && new Date(t.created_at) >= monthStart)).length;
          const totalRevenue = uniqueOrders.reduce((sum, t) => sum + (t.amount_paid || 0), 0);
          
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Monthly Target</p>
                      <p className="text-2xl font-bold">{salesTarget?.monthly_order_target ?? 10}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Calendar className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">This Week</p>
                      <p className="text-2xl font-bold">{ordersThisWeek}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Clock className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">This Month</p>
                      <p className="text-2xl font-bold">{ordersThisMonth}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Users className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Transferred</p>
                      <p className="text-2xl font-bold">{salesTarget?.transferred_orders_count ?? 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <Users className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Closed</p>
                      <p className="text-2xl font-bold">{salesTarget?.closed_orders_count ?? 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <DollarSign className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Revenue</p>
                      <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search by task #, title, business name, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>
        
        <div className="flex justify-end items-center mb-4">
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
              {(() => {
                // Group orders by customer name + title + deadline (same order assigned to multiple teams)
                const groupedOrders = filteredTasks?.reduce((acc, task) => {
                  const groupKey = `${task.customer_name || task.business_name || ''}_${task.title}_${task.deadline || ''}_${task.post_type || ''}`;
                  
                  if (!acc[groupKey]) {
                    acc[groupKey] = {
                      ...task,
                      groupKey,
                      tasks: [task],
                      teams: [(task as any).teams?.name || 'Unknown'],
                      teamCount: 1,
                      statuses: [task.status],
                      taskNumbers: [task.task_number],
                    };
                  } else {
                    acc[groupKey].tasks.push(task);
                    acc[groupKey].teams.push((task as any).teams?.name || 'Unknown');
                    acc[groupKey].teamCount += 1;
                    acc[groupKey].statuses.push(task.status);
                    acc[groupKey].taskNumbers.push(task.task_number);
                  }
                  return acc;
                }, {} as Record<string, any>) || {};
                
                const groupedOrdersList = Object.values(groupedOrders);

                const getOverallStatus = (statuses: string[]) => {
                  if (statuses.includes('pending')) return 'pending';
                  if (statuses.includes('in_progress')) return 'in_progress';
                  if (statuses.includes('completed')) return 'completed';
                  if (statuses.includes('approved')) return 'approved';
                  return statuses[0];
                };

                const toggleGroup = (groupKey: string) => {
                  setExpandedGroups(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(groupKey)) {
                      newSet.delete(groupKey);
                    } else {
                      newSet.add(groupKey);
                    }
                    return newSet;
                  });
                };

                if (groupedOrdersList.length === 0) {
                  return (
                    <div className="text-center py-12 text-muted-foreground">
                      <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No orders found</p>
                      <p className="text-sm">Create your first order to get started</p>
                    </div>
                  );
                }

                return groupedOrdersList.map((group: any) => {
                  const isMultiTeam = group.teamCount > 1;
                  const primaryTask = group.tasks[0];
                  const isDelayed = primaryTask.deadline && new Date(primaryTask.deadline) < today && !['completed', 'approved'].includes(getOverallStatus(group.statuses));
                  const isExpanded = expandedGroups.has(group.groupKey);

                  return (
                    <div 
                      key={group.groupKey} 
                      className={`group border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fade-in ${isDelayed ? 'border-l-4 border-l-destructive bg-destructive/5' : ''}`}
                    >
                      {/* Card Header */}
                      <div className="p-4 bg-gradient-to-r from-muted/30 to-transparent border-b">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-lg bg-background shadow-sm">
                              {getOrderTypeIcon(primaryTask)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                  {isMultiTeam 
                                    ? `#${group.taskNumbers.join(', #')}` 
                                    : `#${primaryTask.task_number}`}
                                </span>
                                {getOrderTypeBadge(primaryTask)}
                                {isMultiTeam && (
                                  <Badge variant="outline" className="text-xs">
                                    <Users className="h-3 w-3 mr-1" />
                                    {group.teamCount} teams
                                  </Badge>
                                )}
                                {isDelayed && <Badge variant="destructive">DELAYED</Badge>}
                              </div>
                              <h3 className="font-semibold text-lg mt-1 truncate">{primaryTask.title}</h3>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className={`${getStatusColor(getOverallStatus(group.statuses))} shadow-sm`}>
                              {getOverallStatus(group.statuses).replace("_", " ")}
                            </Badge>
                            {!isMultiTeam && primaryTask.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 hover:bg-destructive/10"
                                onClick={() => setDeleteTaskId(primaryTask.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 space-y-4">
                        {primaryTask.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{primaryTask.description}</p>
                        )}

                        {/* Info Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {/* Customer Info */}
                          {(primaryTask.customer_name || primaryTask.customer_email || primaryTask.customer_phone) && (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                <User className="h-3.5 w-3.5" />
                                Customer
                              </div>
                              <div className="space-y-1">
                                {primaryTask.customer_name && (
                                  <p className="text-sm font-medium truncate">{primaryTask.customer_name}</p>
                                )}
                                {primaryTask.customer_email && (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Mail className="h-3 w-3" />
                                    <span className="truncate">{primaryTask.customer_email}</span>
                                  </div>
                                )}
                                {primaryTask.customer_phone && (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Phone className="h-3 w-3" />
                                    <span>{primaryTask.customer_phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Payment Info */}
                          {(primaryTask.amount_total || primaryTask.amount_paid || primaryTask.amount_pending) && (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                <DollarSign className="h-3.5 w-3.5" />
                                Payment
                              </div>
                              <div className="space-y-1 text-sm">
                                {primaryTask.amount_total && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total:</span>
                                    <span className="font-medium">${Number(primaryTask.amount_total).toFixed(2)}</span>
                                  </div>
                                )}
                                {primaryTask.amount_paid !== null && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Paid:</span>
                                    <span className="font-medium text-success">${Number(primaryTask.amount_paid).toFixed(2)}</span>
                                  </div>
                                )}
                                {primaryTask.amount_pending && Number(primaryTask.amount_pending) > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Pending:</span>
                                    <span className="font-medium text-warning">${Number(primaryTask.amount_pending).toFixed(2)}</span>
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
                              {isMultiTeam ? (
                                <p className="text-sm font-medium">{group.teamCount} teams assigned</p>
                              ) : isWebsiteOrder(primaryTask) ? (
                                <p className="text-sm font-medium">{getDeveloperForTeam(primaryTask.team_id) || "Unassigned"}</p>
                              ) : (
                                <p className="text-sm font-medium">{(primaryTask.teams as any)?.name || "Unassigned"}</p>
                              )}
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>{format(new Date(primaryTask.created_at!), "MMM d, yyyy")}</span>
                              </div>
                              {primaryTask.deadline && (
                                <div className={`flex items-center gap-1.5 text-xs ${isDelayed ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                  <Clock className="h-3 w-3" />
                                  <span>Due: {format(new Date(primaryTask.deadline), "MMM d, yyyy")}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expandable Team Details for Multi-Team Orders */}
                        {isMultiTeam && (
                          <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(group.groupKey)}>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="w-full justify-between">
                                <span className="text-sm font-medium">View Team Progress</span>
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-3">
                              <div className="space-y-2 border-t pt-3">
                                {group.tasks.map((task: any) => {
                                  const taskDelayed = task.deadline && new Date(task.deadline) < today && !['completed', 'approved'].includes(task.status);
                                  return (
                                    <div 
                                      key={task.id} 
                                      className={`flex items-center justify-between p-3 rounded-lg bg-muted/30 ${taskDelayed ? 'border-l-2 border-l-destructive' : ''}`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="font-mono text-xs text-muted-foreground">#{task.task_number}</span>
                                        <span className="text-sm font-medium">{(task.teams as any)?.name || 'Unknown Team'}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge className={`${getStatusColor(task.status)} text-xs`}>
                                          {task.status.replace("_", " ")}
                                        </Badge>
                                        {task.status === "pending" && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 hover:bg-destructive/10"
                                            onClick={() => setDeleteTaskId(task.id)}
                                          >
                                            <Trash2 className="h-3 w-3 text-destructive" />
                                          </Button>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2"
                                          onClick={() => setViewDetailsTask(task)}
                                        >
                                          <Eye className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {/* Card Footer */}
                        <div className="flex items-center justify-end pt-2 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewDetailsTask(primaryTask)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
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
                      <p><span className="text-muted-foreground">Project Manager:</span> {(viewDetailsTask.project_manager as any)?.full_name || (viewDetailsTask.project_manager as any)?.email || "Unassigned"}</p>
                      {isWebsiteOrder(viewDetailsTask) ? (
                        <p><span className="text-muted-foreground">Developer:</span> {getDeveloperForTeam(viewDetailsTask.team_id) || "Unassigned"}</p>
                      ) : (() => {
                        // Find all tasks with same group key to show all assigned teams
                        const groupKey = `${viewDetailsTask.customer_name || viewDetailsTask.business_name || ''}_${viewDetailsTask.title}_${viewDetailsTask.deadline || ''}_${viewDetailsTask.post_type || ''}`;
                        const relatedTasks = myTasks?.filter(t => {
                          const taskKey = `${t.customer_name || t.business_name || ''}_${t.title}_${t.deadline || ''}_${t.post_type || ''}`;
                          return taskKey === groupKey;
                        }) || [];
                        const teamNames = [...new Set(relatedTasks.map(t => (t as any).teams?.name).filter(Boolean))];
                        
                        return teamNames.length > 1 ? (
                          <div>
                            <span className="text-muted-foreground">Teams:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {teamNames.map((name, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">{name}</Badge>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p><span className="text-muted-foreground">Team:</span> {(viewDetailsTask.teams as any)?.name || "Unassigned"}</p>
                        );
                      })()}
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm uppercase text-muted-foreground">Logo Details</h4>
                      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                        {viewDetailsTask.industry && (
                          <div>
                            <span className="text-sm text-muted-foreground">Industry:</span>
                            <p className="font-medium">{viewDetailsTask.industry}</p>
                          </div>
                        )}
                        {viewDetailsTask.description && (
                          <div>
                            <span className="text-sm text-muted-foreground">Primary Focus:</span>
                            <p className="font-medium">{viewDetailsTask.description}</p>
                          </div>
                        )}
                        {viewDetailsTask.brand_colors && (
                          <div>
                            <span className="text-sm text-muted-foreground">Color Combination:</span>
                            <p className="font-medium">{viewDetailsTask.brand_colors}</p>
                          </div>
                        )}
                        {viewDetailsTask.logo_style && (
                          <div>
                            <span className="text-sm text-muted-foreground">Look & Feel:</span>
                            <p className="font-medium">{viewDetailsTask.logo_style}</p>
                          </div>
                        )}
                        {viewDetailsTask.logo_type && (
                          <div>
                            <span className="text-sm text-muted-foreground">Logo Type:</span>
                            <p className="font-medium">{viewDetailsTask.logo_type}</p>
                          </div>
                        )}
                        {viewDetailsTask.tagline && (
                          <div>
                            <span className="text-sm text-muted-foreground">Tagline:</span>
                            <p className="font-medium">{viewDetailsTask.tagline}</p>
                          </div>
                        )}
                        {viewDetailsTask.notes_extra_instructions && (
                          <div>
                            <span className="text-sm text-muted-foreground">Additional Notes:</span>
                            <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.notes_extra_instructions}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Attachments Section */}
                {viewDetailsTask.attachment_file_path && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm uppercase text-muted-foreground">Reference Files</h4>
                    <div className="bg-muted/30 rounded-lg p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {viewDetailsTask.attachment_file_path.split("|||").map((filePath: string, index: number) => {
                          const fileNames = viewDetailsTask.attachment_file_name?.split("|||") || [];
                          const fileName = fileNames[index] || `File ${index + 1}`;
                          
                          return (
                            <div key={index} className="flex flex-col items-center gap-2 p-2 bg-background rounded-lg border">
                              <FilePreview 
                                filePath={filePath} 
                                fileName={fileName}
                                className="w-20 h-20"
                              />
                              <p className="text-xs text-muted-foreground truncate max-w-full text-center" title={fileName}>
                                {fileName.length > 20 ? `${fileName.substring(0, 17)}...` : fileName}
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs"
                                onClick={async () => {
                                  const { data } = await supabase.storage
                                    .from("design-files")
                                    .createSignedUrl(filePath, 86400);
                                  if (data?.signedUrl) {
                                    window.open(data.signedUrl, "_blank");
                                  }
                                }}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </Button>
                            </div>
                          );
                        })}
                      </div>
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