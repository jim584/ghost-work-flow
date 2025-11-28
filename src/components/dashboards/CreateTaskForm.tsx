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

interface CreateTaskFormProps {
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

const POST_TYPES = ["Product Post", "Service Post", "Announcement", "Offer Post", "Testimonial", "Carousel", "Video", "Static", "Reels"];
const OBJECTIVES = ["Brand Awareness", "Engagement", "Product Highlight", "Conversion", "Seasonal Sale", "Education"];
const POST_TYPE_REQUIRED = ["Static", "Video", "Reel", "Carousel", "Story"];
const DESIGN_STYLES = ["Modern", "Minimal", "Premium", "Bold", "Luxury", "Artistic", "Clean", "Corporate", "Playful"];
const CTAS = ["Shop Now", "Learn More", "Book Now", "Contact Us", "View Details", "Order Now"];
const PLATFORMS = ["Instagram", "Facebook", "TikTok", "LinkedIn", "Pinterest", "YouTube"];

export const CreateTaskForm = ({ userId, teams, onSuccess }: CreateTaskFormProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    team_id: "",
    business_name: "",
    industry: "",
    website_url: "",
    post_type: "",
    objective: "",
    product_service_name: "",
    product_service_images: "",
    product_service_description: "",
    pricing: "",
    post_type_required: "",
    design_style: "",
    brand_colors: "",
    fonts: "",
    logo_url: "",
    headline_main_text: "",
    supporting_text: "",
    cta: "",
    target_audience_age: "",
    target_audience_location: "",
    target_audience_interest: "",
    target_audience_other: "",
    platforms: [] as string[],
    deadline: "",
  });

  const createTask = useMutation({
    mutationFn: async () => {
      setUploading(true);
      try {
        let attachmentFilePaths: string[] = [];
        let attachmentFileNames: string[] = [];

        // Upload attachment files if provided
        if (attachmentFiles.length > 0) {
          for (const file of attachmentFiles) {
            const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const fileName = `task_attachment_${Date.now()}_${sanitizedFileName}`;
            const filePath = `${userId}/task_attachments/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from("design-files")
              .upload(filePath, file);

            if (uploadError) throw uploadError;

            attachmentFilePaths.push(filePath);
            attachmentFileNames.push(fileName);
          }
        }

        const { error } = await supabase.from("tasks").insert({
          ...formData,
          project_manager_id: userId,
          status: "pending",
          attachment_file_path: attachmentFilePaths.length > 0 ? attachmentFilePaths.join("|||") : null,
          attachment_file_name: attachmentFileNames.length > 0 ? attachmentFileNames.join("|||") : null,
        });
        if (error) throw error;
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Task created successfully" });
      setAttachmentFiles([]);
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error creating task",
        description: error.message,
      });
    },
  });

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePlatformToggle = (platform: string) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform]
    }));
  };

  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Basic Information</h3>
          
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="E.g., Instagram Post for New Product Launch"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team">Assign to Team *</Label>
            <Select value={formData.team_id} onValueChange={(value) => handleChange("team_id", value)}>
              <SelectTrigger id="team">
                <SelectValue placeholder="Select a team" />
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
            <Label htmlFor="business_name">Business Name</Label>
            <Input
              id="business_name"
              value={formData.business_name}
              onChange={(e) => handleChange("business_name", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry *</Label>
            <Select value={formData.industry} onValueChange={(value) => handleChange("industry", value)}>
              <SelectTrigger id="industry">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
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

        {/* Post Details */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Post Details</h3>

          <div className="space-y-2">
            <Label htmlFor="post_type">Post Type *</Label>
            <Select value={formData.post_type} onValueChange={(value) => handleChange("post_type", value)}>
              <SelectTrigger id="post_type">
                <SelectValue placeholder="Select post type" />
              </SelectTrigger>
              <SelectContent>
                {POST_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="objective">Objective *</Label>
            <Select value={formData.objective} onValueChange={(value) => handleChange("objective", value)}>
              <SelectTrigger id="objective">
                <SelectValue placeholder="Select objective" />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map((obj) => (
                  <SelectItem key={obj} value={obj}>
                    {obj}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_service_name">Product/Service Name *</Label>
            <Input
              id="product_service_name"
              value={formData.product_service_name}
              onChange={(e) => handleChange("product_service_name", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_service_images">Product/Service Images or Links *</Label>
            <Textarea
              id="product_service_images"
              value={formData.product_service_images}
              onChange={(e) => handleChange("product_service_images", e.target.value)}
              placeholder="Paste image URLs or upload links"
              rows={2}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product_service_description">Product/Service Description *</Label>
            <Textarea
              id="product_service_description"
              value={formData.product_service_description}
              onChange={(e) => handleChange("product_service_description", e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pricing">Pricing (Optional)</Label>
            <Input
              id="pricing"
              value={formData.pricing}
              onChange={(e) => handleChange("pricing", e.target.value)}
              placeholder="E.g., $99 or Free"
            />
          </div>
        </div>

        {/* Design Requirements */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Design Requirements</h3>

          <div className="space-y-2">
            <Label htmlFor="post_type_required">Post Type Required *</Label>
            <Select value={formData.post_type_required} onValueChange={(value) => handleChange("post_type_required", value)}>
              <SelectTrigger id="post_type_required">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                {POST_TYPE_REQUIRED.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="design_style">Design Style *</Label>
            <Select value={formData.design_style} onValueChange={(value) => handleChange("design_style", value)}>
              <SelectTrigger id="design_style">
                <SelectValue placeholder="Select style" />
              </SelectTrigger>
              <SelectContent>
                {DESIGN_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand_colors">Brand Colors</Label>
            <Input
              id="brand_colors"
              value={formData.brand_colors}
              onChange={(e) => handleChange("brand_colors", e.target.value)}
              placeholder="E.g., #FF5733, Blue, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fonts">Fonts</Label>
            <Input
              id="fonts"
              value={formData.fonts}
              onChange={(e) => handleChange("fonts", e.target.value)}
              placeholder="E.g., Montserrat, Arial"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo_url">Logo URL</Label>
            <Input
              id="logo_url"
              type="url"
              value={formData.logo_url}
              onChange={(e) => handleChange("logo_url", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Content</h3>

          <div className="space-y-2">
            <Label htmlFor="headline_main_text">Headline / Main Text</Label>
            <Input
              id="headline_main_text"
              value={formData.headline_main_text}
              onChange={(e) => handleChange("headline_main_text", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supporting_text">Supporting Text</Label>
            <Textarea
              id="supporting_text"
              value={formData.supporting_text}
              onChange={(e) => handleChange("supporting_text", e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cta">Call to Action</Label>
            <Select value={formData.cta} onValueChange={(value) => handleChange("cta", value)}>
              <SelectTrigger id="cta">
                <SelectValue placeholder="Select CTA" />
              </SelectTrigger>
              <SelectContent>
                {CTAS.map((cta) => (
                  <SelectItem key={cta} value={cta}>
                    {cta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Target Audience */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Target Audience</h3>

          <div className="space-y-2">
            <Label htmlFor="target_audience_age">Age</Label>
            <Input
              id="target_audience_age"
              value={formData.target_audience_age}
              onChange={(e) => handleChange("target_audience_age", e.target.value)}
              placeholder="E.g., 25-35"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target_audience_location">Location</Label>
            <Input
              id="target_audience_location"
              value={formData.target_audience_location}
              onChange={(e) => handleChange("target_audience_location", e.target.value)}
              placeholder="E.g., United States, Dubai"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target_audience_interest">Interest</Label>
            <Input
              id="target_audience_interest"
              value={formData.target_audience_interest}
              onChange={(e) => handleChange("target_audience_interest", e.target.value)}
              placeholder="E.g., Fashion, Technology"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target_audience_other">Other</Label>
            <Input
              id="target_audience_other"
              value={formData.target_audience_other}
              onChange={(e) => handleChange("target_audience_other", e.target.value)}
            />
          </div>
        </div>

        {/* Platforms */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Platform(s)</h3>
          <div className="grid grid-cols-2 gap-3">
            {PLATFORMS.map((platform) => (
              <div key={platform} className="flex items-center space-x-2">
                <Checkbox
                  id={platform}
                  checked={formData.platforms.includes(platform)}
                  onCheckedChange={() => handlePlatformToggle(platform)}
                />
                <Label htmlFor={platform} className="cursor-pointer">
                  {platform}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Info */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Additional Information</h3>

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
              placeholder="Brief description of the task"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachment">Attachments (Optional)</Label>
            <Input
              id="attachment"
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setAttachmentFiles(files);
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
              Upload reference files, logos, brand guidelines, audio, video, or any supporting documents (multiple files allowed)
            </p>
          </div>
        </div>

        <Button
          onClick={() => createTask.mutate()}
          disabled={!formData.title || !formData.team_id || !formData.website_url || uploading}
          className="w-full"
        >
          {uploading ? "Creating & Uploading..." : "Create Task"}
        </Button>
      </div>
    </ScrollArea>
  );
};