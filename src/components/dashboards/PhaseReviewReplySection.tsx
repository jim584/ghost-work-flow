import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Send, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { PhaseReviewSubmissionPanel } from "@/components/PhaseReviewSubmissionPanel";
import { FilePreview } from "@/components/FilePreview";
import { PlaybackWaveform } from "@/components/PlaybackWaveform";
import { Download, Play, Pause, Mic } from "lucide-react";

interface PhaseReviewReplySectionProps {
  phaseReviewId: string;
  taskId: string;
  userId: string;
  canReply: boolean; // only developers/team leaders for their tasks
  isPMViewer?: boolean; // when true, marks replies as read on mount
}

const ReplyVoicePlayer = ({ voicePath }: { voicePath: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    if (!audioRef.current) {
      const { data } = await supabase.storage.from("design-files").download(voicePath);
      if (!data) return;
      const url = URL.createObjectURL(data);
      const audio = new Audio(url);
      audio.onloadedmetadata = () => setDuration(audio.duration);
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audio.onended = () => { setIsPlaying(false); setCurrentTime(0); };
      audioRef.current = audio;
    }
    audioRef.current.play();
    setIsPlaying(true);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 p-1.5 bg-muted/50 rounded-md">
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={togglePlay}>
        {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      </Button>
      <Mic className="h-2.5 w-2.5 text-muted-foreground" />
      <PlaybackWaveform audioElement={audioRef.current} isPlaying={isPlaying} barCount={15} className="flex-1" />
      <span className="text-[9px] text-muted-foreground tabular-nums">
        {isPlaying || currentTime > 0 ? formatTime(currentTime) : ""}{duration > 0 ? ` / ${formatTime(duration)}` : ""}
      </span>
    </div>
  );
};

const ReplyFileAttachments = ({ filePaths, fileNames }: { filePaths: string; fileNames: string }) => {
  const paths = filePaths.split("|||");
  const names = fileNames.split("|||");

  const handleDownload = async (path: string, name: string) => {
    const { data } = await supabase.storage.from("design-files").download(path.trim());
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = name.trim(); document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {paths.map((path, i) => {
        const name = names[i]?.trim() || `File ${i + 1}`;
        return (
          <div key={i} className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleDownload(path, name)}>
            <FilePreview filePath={path.trim()} fileName={name} className="w-10 h-10" />
          </div>
        );
      })}
    </div>
  );
};

export const PhaseReviewReplySection = ({ phaseReviewId, taskId, userId, canReply, isPMViewer }: PhaseReviewReplySectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showReplyPanel, setShowReplyPanel] = useState(false);
  const [replyComment, setReplyComment] = useState("");
  const [replyVoiceBlob, setReplyVoiceBlob] = useState<Blob | null>(null);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: replies } = useQuery({
    queryKey: ["phase-review-replies", phaseReviewId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phase_review_replies")
        .select("*")
        .eq("phase_review_id", phaseReviewId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Auto-mark replies as read when PM views them
  useEffect(() => {
    if (!isPMViewer || !replies || replies.length === 0) return;
    const unreadIds = replies
      .filter((r: any) => !r.pm_read_at)
      .map((r: any) => r.id);
    if (unreadIds.length === 0) return;
    supabase
      .from("phase_review_replies")
      .update({ pm_read_at: new Date().toISOString() } as any)
      .in("id", unreadIds)
      .then(({ error }) => {
        if (!error) {
          queryClient.invalidateQueries({ queryKey: ["pm-unread-replies"] });
        }
      });
  }, [isPMViewer, replies, queryClient]);


  const handleSubmitReply = async () => {
    if (!replyComment.trim() && !replyVoiceBlob && replyFiles.length === 0) return;
    setSubmitting(true);

    try {
      let voicePath: string | null = null;
      let filePaths: string | null = null;
      let fileNames: string | null = null;

      // Upload voice if present
      if (replyVoiceBlob) {
        const voiceFileName = `reply-voice-${Date.now()}.webm`;
        const voiceStoragePath = `phase-review-replies/${taskId}/${voiceFileName}`;
        const { error: voiceError } = await supabase.storage
          .from("design-files")
          .upload(voiceStoragePath, replyVoiceBlob, { contentType: "audio/webm" });
        if (voiceError) throw voiceError;
        voicePath = voiceStoragePath;
      }

      // Upload files if present
      if (replyFiles.length > 0) {
        const uploadedPaths: string[] = [];
        const uploadedNames: string[] = [];
        for (const file of replyFiles) {
          const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `phase-review-replies/${taskId}/${Date.now()}-${sanitized}`;
          const { error: fileError } = await supabase.storage
            .from("design-files")
            .upload(storagePath, file);
          if (fileError) throw fileError;
          uploadedPaths.push(storagePath);
          uploadedNames.push(file.name);
        }
        filePaths = uploadedPaths.join("|||");
        fileNames = uploadedNames.join("|||");
      }

      const { error } = await supabase.from("phase_review_replies").insert({
        phase_review_id: phaseReviewId,
        task_id: taskId,
        user_id: userId,
        message: replyComment.trim() || null,
        voice_path: voicePath,
        file_paths: filePaths,
        file_names: fileNames,
      });
      if (error) throw error;

      setReplyComment("");
      setReplyVoiceBlob(null);
      setReplyFiles([]);
      setShowReplyPanel(false);
      queryClient.invalidateQueries({ queryKey: ["phase-review-replies", phaseReviewId] });
      toast({ title: "Reply sent" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to send reply", description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const hasReplies = replies && replies.length > 0;

  return (
    <div className="space-y-1.5">
      {/* Existing replies */}
      {hasReplies && (
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors group">
            <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]:rotate-[-90deg]" />
            <MessageSquare className="h-3 w-3" />
            {replies.length} repl{replies.length !== 1 ? "ies" : "y"}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5 space-y-1.5 ml-3 border-l-2 border-primary/20 pl-2.5">
            {replies.map((reply) => (
              <div key={reply.id} className="bg-primary/5 border border-primary/10 rounded-md p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30">Developer Reply</Badge>
                  <span className="text-[9px] text-muted-foreground">
                    {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                  </span>
                </div>
                {reply.message && (
                  <p className="text-[11px] text-foreground whitespace-pre-wrap">{reply.message}</p>
                )}
                {reply.voice_path && <ReplyVoicePlayer voicePath={reply.voice_path} />}
                {reply.file_paths && reply.file_names && (
                  <ReplyFileAttachments filePaths={reply.file_paths} fileNames={reply.file_names} />
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Reply button & panel */}
      {canReply && !showReplyPanel && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] text-primary hover:text-primary gap-1 px-2"
          onClick={() => setShowReplyPanel(true)}
        >
          <MessageSquare className="h-3 w-3" />
          Reply
        </Button>
      )}

      {canReply && showReplyPanel && (
        <div className="border border-primary/20 rounded-md p-2 space-y-2 bg-primary/5">
          <PhaseReviewSubmissionPanel
            comment={replyComment}
            onCommentChange={setReplyComment}
            voiceBlob={replyVoiceBlob}
            onVoiceBlobChange={setReplyVoiceBlob}
            files={replyFiles}
            onFilesChange={setReplyFiles}
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={submitting || (!replyComment.trim() && !replyVoiceBlob && replyFiles.length === 0)}
              onClick={handleSubmitReply}
            >
              <Send className="h-3 w-3" />
              {submitting ? "Sending..." : "Send Reply"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => { setShowReplyPanel(false); setReplyComment(""); setReplyVoiceBlob(null); setReplyFiles([]); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
