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

interface CreateWebsiteOrderFormProps {
  userId: string;
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

const NUMBER_OF_PAGES = [
  "1-3 Pages (Landing/Simple)",
  "4-6 Pages (Standard)",
  "7-10 Pages (Medium)",
  "11-20 Pages (Large)",
  "20+ Pages (Enterprise)",
];

export const CreateWebsiteOrderForm = ({ userId, onSuccess }: CreateWebsiteOrderFormProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  

  const [formData, setFormData] = useState({
    business_name: "",
    industry: "",
    website_url: "",
    deadline: "",
    // Website specific fields
    number_of_pages: "",
    design_references: "",
    // Content fields
    supporting_text: "",
    notes_extra_instructions: "",
    // Customer & Payment fields
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    customer_domain: "",
    amount_paid: "",
    amount_pending: "",
    amount_total: "",
  });


  const createWebsiteOrder = useMutation({
    mutationFn: async () => {
      setUploading(true);
      try {
        // Get the next developer team using round-robin
        const { data: nextTeamId, error: rpcError } = await supabase.rpc('get_next_developer_team');
        
        if (rpcError) throw rpcError;
        
        if (!nextTeamId) {
          throw new Error("No developer teams available. Please ensure at least one developer is registered.");
        }

        let attachmentFilePaths: string[] = [];
        let attachmentFileNames: string[] = [];
        let logoFilePath: string | null = null;

        // Upload logo file if provided
        if (logoFile) {
          const sanitizedFileName = logoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const fileName = `website_logo_${Date.now()}_${sanitizedFileName}`;
          const filePath = `${userId}/website_logos/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("design-files")
            .upload(filePath, logoFile);

          if (uploadError) throw uploadError;
          logoFilePath = filePath;
        }

        // Upload attachment files if provided
        if (attachmentFiles.length > 0) {
          for (const file of attachmentFiles) {
            const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const fileName = `website_attachment_${Date.now()}_${sanitizedFileName}`;
            const filePath = `${userId}/website_order_attachments/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from("design-files")
              .upload(filePath, file);

            if (uploadError) throw uploadError;

            attachmentFilePaths.push(filePath);
            attachmentFileNames.push(fileName);
          }
        }

        // Create a single task assigned to the next developer team
        const taskData = {
          title: `Website: ${formData.business_name}`,
          description: formData.supporting_text,
          team_id: nextTeamId,
          project_manager_id: userId,
          business_name: formData.business_name,
          industry: formData.industry,
          website_url: formData.website_url,
          post_type: "Website Design",
          logo_url: logoFilePath,
          supporting_text: formData.supporting_text,
          notes_extra_instructions: formData.notes_extra_instructions,
          deadline: formData.deadline || null,
          attachment_file_path: attachmentFilePaths.length > 0 ? attachmentFilePaths.join("|||") : null,
          attachment_file_name: attachmentFileNames.length > 0 ? attachmentFileNames.join("|||") : null,
          status: "pending" as const,
          // Website specific fields
          number_of_pages: formData.number_of_pages,
          design_references: formData.design_references,
          // Customer & Payment fields
          customer_name: formData.customer_name || null,
          customer_email: formData.customer_email || null,
          customer_phone: formData.customer_phone || null,
          customer_domain: formData.customer_domain || null,
          amount_paid: formData.amount_paid ? parseFloat(formData.amount_paid) : 0,
          amount_pending: formData.amount_pending ? parseFloat(formData.amount_pending) : 0,
          amount_total: formData.amount_total ? parseFloat(formData.amount_total) : 0,
        };

        const { error } = await supabase.from("tasks").insert(taskData);

        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
        
        toast({
          title: "Website order created successfully!",
          description: "Order has been automatically assigned to the next available developer.",
        });
        
        onSuccess();
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error creating website order",
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

          <div className="p-3 bg-muted/50 rounded-md border">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Auto-Assignment:</span> This order will be automatically assigned to the next available developer in round-robin order.
            </p>
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
            <Label htmlFor="website_url">Current Website URL (if any)</Label>
            <Input
              id="website_url"
              type="url"
              value={formData.website_url}
              onChange={(e) => handleChange("website_url", e.target.value)}
              placeholder="https://currentwebsite.com"
            />
          </div>
        </div>

        {/* Website Details */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Website Details</h3>


          <div className="space-y-2">
            <Label htmlFor="number_of_pages">Number of Pages *</Label>
            <Select value={formData.number_of_pages} onValueChange={(value) => handleChange("number_of_pages", value)}>
              <SelectTrigger id="number_of_pages">
                <SelectValue placeholder="Select page count" />
              </SelectTrigger>
              <SelectContent>
                {NUMBER_OF_PAGES.map((pages) => (
                  <SelectItem key={pages} value={pages}>
                    {pages}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        {/* Design Preferences */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Design Preferences</h3>

          <div className="space-y-2">
            <Label htmlFor="logo_file">Logo File</Label>
            <Input
              id="logo_file"
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setLogoFile(file);
              }}
              accept="image/*,.ai,.psd,.svg,.eps"
            />
            {logoFile && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded border">
                {logoFile.type.startsWith('image/') ? (
                  <img 
                    src={URL.createObjectURL(logoFile)} 
                    alt="Logo preview" 
                    className="w-16 h-16 object-contain rounded border border-border"
                  />
                ) : (
                  <div className="w-16 h-16 flex items-center justify-center bg-secondary rounded border border-border">
                    <FileIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{logoFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(logoFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setLogoFile(null)}
                >
                  Remove
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Upload client's logo (PNG, JPG, SVG, AI, PSD, EPS)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="design_references">Design References/Inspiration</Label>
            <Textarea
              id="design_references"
              value={formData.design_references}
              onChange={(e) => handleChange("design_references", e.target.value)}
              rows={3}
              placeholder="Links to websites you like or describe the style you're looking for"
            />
          </div>
        </div>

        {/* Content & Deadline */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold text-lg">Content & Deadline</h3>

          <div className="space-y-2">
            <Label htmlFor="supporting_text">Brief Description of Business</Label>
            <Textarea
              id="supporting_text"
              value={formData.supporting_text}
              onChange={(e) => handleChange("supporting_text", e.target.value)}
              rows={3}
              placeholder="Describe what your business does and key selling points"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deadline">Target Completion Date</Label>
            <Input
              id="deadline"
              type="date"
              value={formData.deadline}
              onChange={(e) => handleChange("deadline", e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes_extra_instructions">Additional Notes & Requirements</Label>
            <Textarea
              id="notes_extra_instructions"
              value={formData.notes_extra_instructions}
              onChange={(e) => handleChange("notes_extra_instructions", e.target.value)}
              rows={4}
              placeholder="Any additional notes, special requirements, or instructions"
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
                e.target.value = '';
              }}
              accept="image/*,.pdf,.doc,.docx,.ai,.psd,.fig,.sketch,.zip"
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
              Upload logos, design references, content documents, or any relevant materials
            </p>
          </div>
        </div>

        <Button
          onClick={() => createWebsiteOrder.mutate()}
          disabled={
            !formData.business_name || 
            !formData.customer_name || 
            !formData.industry || 
            !formData.number_of_pages ||
            uploading
          }
          className="w-full"
        >
          {uploading ? "Creating Website Order..." : "Create Website Order"}
        </Button>
      </div>
    </ScrollArea>
  );
};
