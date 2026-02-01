import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { File as FileIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CreateLogoOrderFormProps {
  userId: string;
  teams: any[];
  onSuccess: () => void;
}

const INDUSTRIES = [
  "Arts, Culture & Crafts",
  "Community & Cultural Services",
  "Consulting & Professional Services",
  "Education & Learning",
  "Entertainment & Media",
  "Environmental & Sustainability",
  "Events & Celebrations",
  "Fashion, Beauty & Lifestyle",
  "Finance, Insurance & Legal",
  "Fitness & Sports",
  "Food, Beverage & Hospitality",
  "Gaming & Virtual Spaces",
  "Government & Public Services",
  "Healthcare & Wellness",
  "Household & Personal Services",
  "Industrial, Manufacturing & Energy",
  "Luxury & Lifestyle",
  "Non-Profit & Social Causes",
  "Pets, Animals & Agriculture",
  "Political, Governance & Civic Services",
  "Real Estate",
  "Science & Research",
  "Technology & Innovation",
  "Telecommunications & Connectivity",
  "Transportation & Logistics",
  "Travel & Adventure",
];

const COLOR_COMBINATIONS = ["Bright", "Light", "Royal", "Open To It"];
const LOOK_AND_FEEL = [
  "Clean",
  "High tech",
  "Classic",
  "Funny",
  "Abstract",
  "Comic",
  "Youthful",
  "Elegant",
  "Modern",
  "Animated",
  "Artistic",
  "Sophisticated",
];

export const CreateLogoOrderForm = ({ userId, teams, onSuccess }: CreateLogoOrderFormProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    logo_name: "",
    deadline: "",
    industry: "",
    primary_focus: "",
    color_combination: "",
    color_combination_custom: "",
    look_and_feel: "",
    look_and_feel_custom: "",
    notes: "",
    // Customer & Payment fields
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    customer_domain: "",
    amount_paid: "",
    amount_pending: "",
    amount_total: "",
  });

  const handleTeamToggle = (teamId: string) => {
    setSelectedTeamIds(prev => 
      prev.includes(teamId) 
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    );
  };

  const handleSelectAllTeams = () => {
    if (selectedTeamIds.length === teams?.length) {
      setSelectedTeamIds([]);
    } else {
      setSelectedTeamIds(teams?.map(t => t.id) || []);
    }
  };

  const createLogoOrder = useMutation({
    mutationFn: async () => {
      setUploading(true);
      try {
        let attachmentFilePaths: string[] = [];
        let attachmentFileNames: string[] = [];

        // Upload attachment files if provided
        if (attachmentFiles.length > 0) {
          for (const file of attachmentFiles) {
            const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const fileName = `logo_attachment_${Date.now()}_${sanitizedFileName}`;
            const filePath = `${userId}/logo_order_attachments/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from("design-files")
              .upload(filePath, file);

            if (uploadError) throw uploadError;

            attachmentFilePaths.push(filePath);
            attachmentFileNames.push(fileName);
          }
        }

        // Combine select values with custom text
        const colorCombination = [formData.color_combination, formData.color_combination_custom]
          .filter(Boolean)
          .join(" - ") || null;
        const lookAndFeel = [formData.look_and_feel, formData.look_and_feel_custom]
          .filter(Boolean)
          .join(" - ") || null;

        // Create a task for each selected team
        const tasksToInsert = selectedTeamIds.map(teamId => ({
          title: formData.logo_name,
          description: formData.primary_focus,
          team_id: teamId,
          project_manager_id: userId,
          business_name: formData.logo_name,
          industry: formData.industry,
          post_type: "Logo Design",
          logo_style: lookAndFeel,
          brand_colors: colorCombination,
          notes_extra_instructions: formData.notes,
          deadline: formData.deadline || null,
          attachment_file_path: attachmentFilePaths.length > 0 ? attachmentFilePaths.join("|||") : null,
          attachment_file_name: attachmentFileNames.length > 0 ? attachmentFileNames.join("|||") : null,
          status: "pending" as const,
          // Customer & Payment fields
          customer_name: formData.customer_name || null,
          customer_email: formData.customer_email || null,
          customer_phone: formData.customer_phone || null,
          customer_domain: formData.customer_domain || null,
          amount_paid: formData.amount_paid ? parseFloat(formData.amount_paid) : 0,
          amount_pending: formData.amount_pending ? parseFloat(formData.amount_pending) : 0,
          amount_total: formData.amount_total ? parseFloat(formData.amount_total) : 0,
        }));

        const { error } = await supabase.from("tasks").insert(tasksToInsert);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
        
        toast({
          title: "Logo order created successfully!",
          description: `${selectedTeamIds.length} team(s) will be notified.`,
        });
        
        onSuccess();
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error creating logo order",
          description: error.message,
        });
      } finally {
        setUploading(false);
      }
    },
  });

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };


  return (
    <ScrollArea className="h-[calc(100vh-200px)] pr-4">
      <div className="space-y-6">
        {/* Customer Information */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Customer Information</h3>
          
          <div className="space-y-2">
            <Label htmlFor="customer_name">Customer Name *</Label>
            <Input
              id="customer_name"
              value={formData.customer_name}
              onChange={(e) => handleChange("customer_name", e.target.value)}
              placeholder="Enter customer name"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_email">Customer Email</Label>
              <Input
                id="customer_email"
                type="email"
                value={formData.customer_email}
                onChange={(e) => handleChange("customer_email", e.target.value)}
                placeholder="customer@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_phone">Customer Phone</Label>
              <Input
                id="customer_phone"
                type="tel"
                value={formData.customer_phone}
                onChange={(e) => handleChange("customer_phone", e.target.value)}
                placeholder="+1 234 567 890"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer_domain">Customer Domain</Label>
            <Input
              id="customer_domain"
              type="url"
              value={formData.customer_domain}
              onChange={(e) => handleChange("customer_domain", e.target.value)}
              placeholder="https://customerdomain.com"
            />
          </div>
        </div>

        {/* Payment Information */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Payment Information</h3>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount_total">Total Amount</Label>
              <Input
                id="amount_total"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount_total}
                onChange={(e) => handleChange("amount_total", e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount_paid">Amount Paid</Label>
              <Input
                id="amount_paid"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount_paid}
                onChange={(e) => handleChange("amount_paid", e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount_pending">Amount Pending</Label>
              <Input
                id="amount_pending"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount_pending}
                onChange={(e) => handleChange("amount_pending", e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Logo Details */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Logo Details</h3>
          
          <div className="space-y-2">
            <Label htmlFor="logo_name">Logo Name *</Label>
            <Input
              id="logo_name"
              value={formData.logo_name}
              onChange={(e) => handleChange("logo_name", e.target.value)}
              placeholder="Enter logo name"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Assign to Designer Team(s) *</Label>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm"
                onClick={handleSelectAllTeams}
              >
                {selectedTeamIds.length === teams?.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              {teams?.map((team) => (
                <div key={team.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`team-${team.id}`}
                    checked={selectedTeamIds.includes(team.id)}
                    onCheckedChange={() => handleTeamToggle(team.id)}
                  />
                  <Label htmlFor={`team-${team.id}`} className="cursor-pointer font-normal">
                    {team.name}
                  </Label>
                </div>
              ))}
            </div>
            {selectedTeamIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedTeamIds.length} team(s) selected
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline *</Label>
            <Input
              id="deadline"
              type="date"
              value={formData.deadline}
              onChange={(e) => handleChange("deadline", e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry (Select Any) *</Label>
            <Select value={formData.industry} onValueChange={(value) => handleChange("industry", value)}>
              <SelectTrigger id="industry">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((industry) => (
                  <SelectItem key={industry} value={industry}>
                    {industry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="primary_focus">Primary Focus</Label>
            <Textarea
              id="primary_focus"
              value={formData.primary_focus}
              onChange={(e) => handleChange("primary_focus", e.target.value)}
              rows={3}
              placeholder="Describe the primary focus of the logo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color_combination">Color Combination (Select Any)</Label>
            <Select value={formData.color_combination} onValueChange={(value) => handleChange("color_combination", value)}>
              <SelectTrigger id="color_combination">
                <SelectValue placeholder="Select color combination" />
              </SelectTrigger>
              <SelectContent>
                {COLOR_COMBINATIONS.map((color) => (
                  <SelectItem key={color} value={color}>
                    {color}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="color_combination_custom"
              value={formData.color_combination_custom}
              onChange={(e) => handleChange("color_combination_custom", e.target.value)}
              placeholder="Or specify custom colors (e.g., Blue and Gold)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="look_and_feel">Overall Look & Feel (Select Any)</Label>
            <Select value={formData.look_and_feel} onValueChange={(value) => handleChange("look_and_feel", value)}>
              <SelectTrigger id="look_and_feel">
                <SelectValue placeholder="Select look and feel" />
              </SelectTrigger>
              <SelectContent>
                {LOOK_AND_FEEL.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="look_and_feel_custom"
              value={formData.look_and_feel_custom}
              onChange={(e) => handleChange("look_and_feel_custom", e.target.value)}
              placeholder="Or describe custom style (e.g., Minimalist with bold typography)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              rows={4}
              placeholder="Any additional notes or requirements"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachment">Reference Files (Optional)</Label>
            <Input
              id="attachment"
              type="file"
              multiple
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []);
                setAttachmentFiles(prev => [...prev, ...newFiles]);
                // Reset input to allow selecting the same file again
                e.target.value = '';
              }}
              accept="image/*,.pdf,.doc,.docx,.ai,.psd,.fig,.sketch,.zip,audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.mp4,.mov,.avi,.mkv,.webm"
            />
            {attachmentFiles.length > 0 && (
              <div className="space-y-2">
                {attachmentFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded border">
                    {file.type.startsWith('image/') ? (
                      <img 
                        src={URL.createObjectURL(file)} 
                        alt="Preview" 
                        className="w-16 h-16 object-cover rounded border border-border"
                      />
                    ) : (
                      <div className="w-16 h-16 flex items-center justify-center bg-secondary rounded border border-border">
                        <FileIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAttachmentFiles(files => files.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Upload existing logos, sketches, audio, video, or reference materials (multiple files allowed)
            </p>
          </div>
        </div>

        <Button
          onClick={() => createLogoOrder.mutate()}
          disabled={!formData.logo_name || !formData.customer_name || selectedTeamIds.length === 0 || !formData.industry || !formData.deadline || uploading}
          className="w-full"
        >
          {uploading ? "Creating Logo Order..." : `Create Logo Order${selectedTeamIds.length > 1 ? ` (${selectedTeamIds.length} teams)` : ''}`}
        </Button>
      </div>
    </ScrollArea>
  );
};
