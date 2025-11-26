import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ScrollArea } from "@/components/ui/scroll-area";
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
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    logo_name: "",
    team_id: "",
    industry: "",
    primary_focus: "",
    color_combination: "",
    look_and_feel: "",
    notes: "",
  });

  const createLogoOrder = useMutation({
    mutationFn: async () => {
      setUploading(true);
      try {
        let attachmentFilePath = null;
        let attachmentFileName = null;

        // Upload attachment file if provided
        if (attachmentFile) {
          const sanitizedFileName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filePath = `${userId}/logo_order_attachments/logo_attachment_${Date.now()}_${sanitizedFileName}`;

          const { error: uploadError } = await supabase.storage
            .from("design-files")
            .upload(filePath, attachmentFile);

          if (uploadError) throw uploadError;

          attachmentFilePath = filePath;
          attachmentFileName = `logo_attachment_${Date.now()}_${sanitizedFileName}`;
        }

        const { error } = await supabase.from("tasks").insert({
          title: formData.logo_name,
          description: formData.primary_focus,
          team_id: formData.team_id,
          project_manager_id: userId,
          business_name: formData.logo_name,
          industry: formData.industry,
          post_type: "Logo Design",
          logo_style: formData.look_and_feel,
          brand_colors: formData.color_combination,
          notes_extra_instructions: formData.notes,
          attachment_file_path: attachmentFilePath,
          attachment_file_name: attachmentFileName,
          status: "pending",
        });

        if (error) throw error;

        toast({
          title: "Logo order created successfully!",
          description: "The design team will be notified.",
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
        <div className="space-y-4">
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
            <Label htmlFor="team_id">Assign to Team *</Label>
            <Select value={formData.team_id} onValueChange={(value) => handleChange("team_id", value)}>
              <SelectTrigger id="team_id">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {teams?.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setAttachmentFile(file);
                
                if (file && file.type.startsWith('image/')) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setAttachmentPreview(reader.result as string);
                  };
                  reader.readAsDataURL(file);
                } else {
                  setAttachmentPreview(null);
                }
              }}
              accept="image/*,.pdf,.doc,.docx,.ai,.psd,.fig,.sketch,.zip"
            />
            {attachmentFile && (
              <div className="flex items-center gap-3 p-2 bg-muted/50 rounded">
                {attachmentPreview && (
                  <img 
                    src={attachmentPreview} 
                    alt="Preview" 
                    className="w-16 h-16 object-cover rounded border"
                  />
                )}
                <div className="flex-1">
                  <p className="text-xs font-medium">
                    {attachmentFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(attachmentFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Upload existing logos, sketches, or reference materials
            </p>
          </div>
        </div>

        <Button
          onClick={() => createLogoOrder.mutate()}
          disabled={!formData.logo_name || !formData.team_id || !formData.industry || uploading}
          className="w-full"
        >
          {uploading ? "Creating Logo Order..." : "Create Logo Order"}
        </Button>
      </div>
    </ScrollArea>
  );
};
