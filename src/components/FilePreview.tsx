import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileIcon } from "lucide-react";

interface FilePreviewProps {
  filePath: string;
  fileName: string;
  className?: string;
}

export const FilePreview = ({ filePath, fileName, className = "w-12 h-12" }: FilePreviewProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);

  useEffect(() => {
    const loadPreview = async () => {
      // Check if file is an image based on extension
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
      const isImageFile = imageExtensions.some(ext => 
        fileName.toLowerCase().endsWith(ext)
      );
      
      setIsImage(isImageFile);

      if (isImageFile) {
        try {
          // Use signed URL instead of public URL for security
          const { data, error } = await supabase.storage
            .from("design-files")
            .createSignedUrl(filePath, 3600); // 1 hour expiration
          
          if (error) {
            console.error("Error creating signed URL:", error);
            return;
          }
          
          if (data?.signedUrl) {
            setPreviewUrl(data.signedUrl);
          }
        } catch (error) {
          console.error("Error loading preview:", error);
        }
      }
    };

    loadPreview();
  }, [filePath, fileName]);

  if (isImage && previewUrl) {
    return (
      <img 
        src={previewUrl} 
        alt={fileName}
        className={`object-cover rounded border ${className}`}
        onError={() => setPreviewUrl(null)}
      />
    );
  }

  // Show file icon for non-images
  return (
    <div className={`flex items-center justify-center bg-muted rounded border ${className}`}>
      <FileIcon className="h-6 w-6 text-muted-foreground" />
    </div>
  );
};
