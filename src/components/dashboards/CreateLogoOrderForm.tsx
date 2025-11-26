import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  "E-commerce & Retail",
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

const LOGO_TYPES = ["Wordmark", "Lettermark", "Icon/Symbol", "Combination Mark", "Emblem", "Abstract Mark"];
const LOGO_STYLES = ["Modern", "Minimal", "Vintage", "Elegant", "Bold", "Playful", "Corporate", "Handcrafted", "Geometric", "Illustrative"];
const FILE_FORMATS = ["PNG", "JPG", "SVG", "EPS", "AI", "PDF"];
const USAGE_TYPES = ["Web Only", "Print Only", "Web & Print", "Merchandise", "Social Media", "All Purposes"];

export const CreateLogoOrderForm = ({ userId, teams, onSuccess }: CreateLogoOrderFormProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    team_id: "",
    business_name: "",
    industry: "",
    website_url: "",
    logo_type: "",
    logo_style: "",
    color_preferences: "",
    tagline: "",
    number_of_concepts: "3",
    number_of_revisions: "2",
    file_formats: [] as string[],
    usage_type: "",
    inspiration_competitors: "",
    deadline: "",
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
          title: formData.title,
          description: formData.description,
          team_id: formData.team_id,
          project_manager_id: userId,
          business_name: formData.business_name,
          industry: formData.industry,
          website_url: formData.website_url,
          post_type: "Logo Design",
          logo_type: formData.logo_type,
          logo_style: formData.logo_style,
          brand_colors: formData.color_preferences,
          tagline: formData.tagline,
          number_of_concepts: formData.number_of_concepts,
          number_of_revisions: formData.number_of_revisions,
          file_formats_needed: formData.file_formats.join(", "),
          usage_type: formData.usage_type,
          competitors_inspiration: formData.inspiration_competitors,
          deadline: formData.deadline,
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

  const handleFormatToggle = (format: string) => {
    setFormData((prev) => ({
      ...prev,
      file_formats: prev.file_formats.includes(format)
        ? prev.file_formats.filter((f) => f !== format)
        : [...prev.file_formats, format],
    }));
  };

  return (
    <ScrollArea className="h-[calc(100vh-200px)] pr-4">
      <div className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
          
          <div className="space-y-2">
            <Label htmlFor="title">Order Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="e.g., Company Logo Design"
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
        </div>

        {/* Business Information */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Business Information</h3>

          <div className="space-y-2">
            <Label htmlFor="business_name">Business Name *</Label>
            <Input
              id="business_name"
              value={formData.business_name}
              onChange={(e) => handleChange("business_name", e.target.value)}
              placeholder="Enter business name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry *</Label>
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
            <Label htmlFor="website_url">Website URL *</Label>
            <Input
              id="website_url"
              type="url"
              value={formData.website_url}
              onChange={(e) => handleChange("website_url", e.target.value)}
              placeholder="https://example.com"
              required
            />
          </div>
        </div>

        {/* Logo Specifications */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Logo Specifications</h3>

          <div className="space-y-2">
            <Label htmlFor="logo_type">Logo Type *</Label>
            <Select value={formData.logo_type} onValueChange={(value) => handleChange("logo_type", value)}>
              <SelectTrigger id="logo_type">
                <SelectValue placeholder="Select logo type" />
              </SelectTrigger>
              <SelectContent>
                {LOGO_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo_style">Logo Style</Label>
            <Select value={formData.logo_style} onValueChange={(value) => handleChange("logo_style", value)}>
              <SelectTrigger id="logo_style">
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                {LOGO_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color_preferences">Color Preferences</Label>
            <Input
              id="color_preferences"
              value={formData.color_preferences}
              onChange={(e) => handleChange("color_preferences", e.target.value)}
              placeholder="e.g., Blue, Gold, or specific hex codes"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline (if any)</Label>
            <Input
              id="tagline"
              value={formData.tagline}
              onChange={(e) => handleChange("tagline", e.target.value)}
              placeholder="Enter company tagline"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="number_of_concepts">Number of Concepts</Label>
              <Select value={formData.number_of_concepts} onValueChange={(value) => handleChange("number_of_concepts", value)}>
                <SelectTrigger id="number_of_concepts">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "4", "5"].map((num) => (
                    <SelectItem key={num} value={num}>
                      {num} Concept{num !== "1" ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="number_of_revisions">Number of Revisions</Label>
              <Select value={formData.number_of_revisions} onValueChange={(value) => handleChange("number_of_revisions", value)}>
                <SelectTrigger id="number_of_revisions">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "4", "5", "Unlimited"].map((num) => (
                    <SelectItem key={num} value={num}>
                      {num} Revision{num !== "1" && num !== "Unlimited" ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Deliverables */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Deliverables</h3>

          <div className="space-y-3">
            <Label>File Formats Needed *</Label>
            <div className="grid grid-cols-2 gap-3">
              {FILE_FORMATS.map((format) => (
                <div key={format} className="flex items-center space-x-2">
                  <Checkbox
                    id={format}
                    checked={formData.file_formats.includes(format)}
                    onCheckedChange={() => handleFormatToggle(format)}
                  />
                  <Label htmlFor={format} className="cursor-pointer">
                    {format}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="usage_type">Usage Type</Label>
            <Select value={formData.usage_type} onValueChange={(value) => handleChange("usage_type", value)}>
              <SelectTrigger id="usage_type">
                <SelectValue placeholder="Select usage" />
              </SelectTrigger>
              <SelectContent>
                {USAGE_TYPES.map((usage) => (
                  <SelectItem key={usage} value={usage}>
                    {usage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Additional Information */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Additional Information</h3>

          <div className="space-y-2">
            <Label htmlFor="inspiration_competitors">Inspiration / Competitors</Label>
            <Textarea
              id="inspiration_competitors"
              value={formData.inspiration_competitors}
              onChange={(e) => handleChange("inspiration_competitors", e.target.value)}
              rows={3}
              placeholder="List any competitor logos or inspirations"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline *</Label>
            <Input
              id="deadline"
              type="date"
              value={formData.deadline}
              onChange={(e) => handleChange("deadline", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description / Brief</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={2}
              placeholder="Brief description of the logo order"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes / Extra Instructions</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              rows={3}
              placeholder="Any additional instructions or requirements"
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
          disabled={!formData.title || !formData.team_id || !formData.business_name || !formData.industry || !formData.website_url || !formData.deadline || uploading}
          className="w-full"
        >
          {uploading ? "Creating Logo Order..." : "Create Logo Order"}
        </Button>
      </div>
    </ScrollArea>
  );
};
