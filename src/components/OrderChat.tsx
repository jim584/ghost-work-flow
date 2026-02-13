import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Paperclip, Reply, X, Download, CheckCheck, Check, FileIcon, Mic, Square, Play, Pause } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface OrderChatProps {
  taskId: string;
  taskTitle: string;
  taskNumber: number;
}

interface Message {
  id: string;
  task_id: string;
  sender_id: string;
  message: string;
  file_path: string | null;
  file_name: string | null;
  parent_message_id: string | null;
  status: string;
  created_at: string;
  sender?: { full_name: string | null; email: string };
  parent_message?: { message: string; sender?: { full_name: string | null } } | null;
}

// Inline audio player for voice messages
const VoiceMessagePlayer = ({ filePath, fileName }: { filePath: string; fileName: string }) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayPause = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioUrl) {
      setLoading(true);
      const { data, error } = await supabase.storage.from("design-files").download(filePath);
      if (error || !data) { setLoading(false); return; }
      const url = URL.createObjectURL(data);
      setAudioUrl(url);
      const audio = new Audio(url);
      audio.onended = () => setIsPlaying(false);
      audioRef.current = audio;
      audio.play();
      setIsPlaying(true);
      setLoading(false);
    } else {
      audioRef.current?.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded border">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handlePlayPause} disabled={loading}>
        {loading ? (
          <span className="h-3 w-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <Mic className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground flex-1">{fileName}</span>
    </div>
  );
};

export const OrderChat = ({ taskId, taskTitle, taskNumber }: OrderChatProps) => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  

  // Fetch messages
  const { data: messages = [] } = useQuery({
    queryKey: ["order-messages", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Fetch sender profiles
      const senderIds = [...new Set((data || []).map((m: any) => m.sender_id))];
      
      let profileMap = new Map<string, any>();
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", senderIds);
        profiles?.forEach(p => profileMap.set(p.id, p));
      }

      return (data || []).map((m: any) => {
        const parentMsg = m.parent_message_id
          ? data?.find((pm: any) => pm.id === m.parent_message_id)
          : null;
        return {
          ...m,
          sender: profileMap.get(m.sender_id),
          parent_message: parentMsg
            ? { message: parentMsg.message, sender: profileMap.get(parentMsg.sender_id) }
            : null,
        } as Message;
      });
    },
  });

  // Fetch read receipts for all messages in this chat
  const messageIds = messages.map(m => m.id);
  const { data: readReceipts = [] } = useQuery({
    queryKey: ["message-reads", taskId, messageIds],
    queryFn: async () => {
      if (!messageIds.length) return [];
      const { data, error } = await supabase
        .from("order_message_reads")
        .select("message_id, user_id, read_at")
        .in("message_id", messageIds);
      if (error) throw error;
      return data || [];
    },
    enabled: messageIds.length > 0,
  });

  // Mark messages as read when chat opens
  useEffect(() => {
    if (!user?.id || !messages.length) return;
    const unreadMessageIds = messages
      .filter(m => m.sender_id !== user.id)
      .map(m => m.id);
    if (!unreadMessageIds.length) return;

    const markAsRead = async () => {
      for (const messageId of unreadMessageIds) {
        await supabase
          .from("order_message_reads")
          .upsert(
            { message_id: messageId, user_id: user.id, read_at: new Date().toISOString() },
            { onConflict: "message_id,user_id" }
          );
      }
      // Invalidate unread counts and read receipts
      queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      queryClient.invalidateQueries({ queryKey: ["message-reads", taskId] });
    };
    markAsRead();
  }, [messages, user?.id]);

  // Realtime subscription for messages
  useEffect(() => {
    const channel = supabase
      .channel(`order-messages-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_messages", filter: `task_id=eq.${taskId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["order-messages", taskId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [taskId]);

  // Realtime subscription for read receipts
  useEffect(() => {
    const channel = supabase
      .channel(`order-message-reads-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_message_reads" },
        (payload) => {
          const newRecord = payload.new as any;
          if (newRecord?.message_id && messageIds.includes(newRecord.message_id)) {
            queryClient.invalidateQueries({ queryKey: ["message-reads", taskId] });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [taskId, messageIds.join(",")]);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    // Small delay to ensure DOM is updated
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [messages]);

  // Send message
  const sendMessage = async () => {
    if (!messageText.trim() && !selectedFile) return;
    if (!user?.id) return;
    setSending(true);

    try {
      let filePath: string | null = null;
      let fileName: string | null = null;

      if (selectedFile) {
        const ext = selectedFile.name.split(".").pop();
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const storagePath = `chat-files/${taskId}/${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("design-files")
          .upload(storagePath, selectedFile);
        if (uploadError) throw uploadError;
        filePath = storagePath;
        fileName = selectedFile.name;
      }

      const { error } = await supabase.from("order_messages").insert({
        task_id: taskId,
        sender_id: user.id,
        message: messageText.trim() || (fileName ? `Shared file: ${fileName}` : ""),
        file_path: filePath,
        file_name: fileName,
        parent_message_id: replyTo?.id || null,
        status: "pending",
      });
      if (error) throw error;

      setMessageText("");
      setReplyTo(null);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["order-messages", taskId] });
      queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      // Scroll to bottom after sending
      setTimeout(() => scrollToBottom(), 100);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error sending message", description: error.message });
    } finally {
      setSending(false);
    }
  };




  // Download file
  const handleDownload = async (fp: string, fn: string) => {
    const { data, error } = await supabase.storage.from("design-files").download(fp);
    if (error) { toast({ variant: "destructive", title: "Download failed" }); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = fn; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        setAudioPreview({ blob, url });
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } catch {
      toast({ variant: "destructive", title: "Microphone access denied", description: "Please allow microphone access to send voice messages." });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const cancelRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
    if (audioPreview) {
      URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPlayingPreview(false);
    setRecordingDuration(0);
  };

  const togglePreviewPlayback = () => {
    if (!audioPreview) return;
    if (isPlayingPreview && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      const audio = new Audio(audioPreview.url);
      audio.onended = () => setIsPlayingPreview(false);
      previewAudioRef.current = audio;
      audio.play();
      setIsPlayingPreview(true);
    }
  };

  const sendVoiceMessage = async () => {
    if (!audioPreview || !user?.id) return;
    setSending(true);
    try {
      const ext = audioPreview.blob.type.includes('webm') ? 'webm' : 'm4a';
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const storagePath = `chat-files/${taskId}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("design-files")
        .upload(storagePath, audioPreview.blob, { contentType: audioPreview.blob.type });
      if (uploadError) throw uploadError;

      const voiceFileName = `Voice message.${ext}`;
      const { error } = await supabase.from("order_messages").insert({
        task_id: taskId,
        sender_id: user.id,
        message: "🎤 Voice message",
        file_path: storagePath,
        file_name: voiceFileName,
        parent_message_id: replyTo?.id || null,
        status: "pending",
      });
      if (error) throw error;

      URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
      setReplyTo(null);
      setRecordingDuration(0);
      setIsPlayingPreview(false);
      queryClient.invalidateQueries({ queryKey: ["order-messages", taskId] });
      queryClient.invalidateQueries({ queryKey: ["unread-message-counts"] });
      setTimeout(() => scrollToBottom(), 100);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error sending voice message", description: error.message });
    } finally {
      setSending(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Check if a file is a voice message (audio file)
  const isVoiceMessage = (fileName: string | null) => {
    if (!fileName) return false;
    return fileName.startsWith('Voice message') || /\.(webm|m4a|ogg|mp3|wav)$/i.test(fileName);
  };

  // Group messages by date
  const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMM d, yyyy");
  };

  const getInitials = (name: string | null | undefined, email?: string) => {
    if (name) return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    if (email) return email[0].toUpperCase();
    return "?";
  };

  let lastDateLabel = "";

  return (
    <div className="flex flex-col h-[60vh]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4" ref={scrollViewportRef}>
        <div className="space-y-3 py-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Start the conversation!</p>
          )}
          {messages.map((msg) => {
            const dateLabel = getDateLabel(msg.created_at);
            const showDate = dateLabel !== lastDateLabel;
            lastDateLabel = dateLabel;
            const isOwn = msg.sender_id === user?.id;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground px-2">{dateLabel}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs">
                      {getInitials(msg.sender?.full_name, msg.sender?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`max-w-[75%] space-y-1 ${isOwn ? "items-end" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {msg.sender?.full_name || msg.sender?.email || "Unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(msg.created_at), "h:mm a")}
                      </span>
                      {(() => {
                        if (isOwn) {
                          // Sender sees when the recipient read their message
                          const othersWhoRead = readReceipts.filter(
                            r => r.message_id === msg.id && r.user_id !== user?.id
                          );
                          if (othersWhoRead.length > 0) {
                            return (
                              <span className="text-xs text-primary flex items-center gap-0.5">
                                <CheckCheck className="h-3 w-3" />
                                Seen at {format(new Date(othersWhoRead[0].read_at), "h:mm a")}
                              </span>
                            );
                          }
                          return (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Check className="h-3 w-3" />
                              Sent
                            </span>
                          );
                        } else {
                          // Recipient sees when they read this message
                          const myRead = readReceipts.find(
                            r => r.message_id === msg.id && r.user_id === user?.id
                          );
                          if (myRead) {
                            return (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <CheckCheck className="h-3 w-3" />
                                Seen at {format(new Date(myRead.read_at), "h:mm a")}
                              </span>
                            );
                          }
                          return null;
                        }
                      })()}
                    </div>

                    {/* Reply reference */}
                    {msg.parent_message && (
                      <div className="text-xs bg-muted/50 border-l-2 border-primary/40 pl-2 py-1 rounded-r text-muted-foreground truncate">
                        {msg.parent_message.sender?.full_name || "Someone"}: {msg.parent_message.message.slice(0, 60)}
                        {msg.parent_message.message.length > 60 ? "..." : ""}
                      </div>
                    )}

                    <div className={`rounded-lg px-3 py-2 text-sm ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {msg.message}
                    </div>

                    {/* File attachment */}
                    {msg.file_path && msg.file_name && (
                      isVoiceMessage(msg.file_name) ? (
                        <VoiceMessagePlayer filePath={msg.file_path} fileName={msg.file_name} />
                      ) : (
                        <div
                          className="flex items-center gap-2 p-2 bg-muted/50 rounded border cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => handleDownload(msg.file_path!, msg.file_name!)}
                        >
                          <FileIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs truncate flex-1">{msg.file_name}</span>
                          <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-xs text-muted-foreground px-1"
                      onClick={() => setReplyTo(msg)}
                    >
                      <Reply className="h-3 w-3 mr-1" />
                      Reply
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-t text-xs">
          <Reply className="h-3 w-3 text-muted-foreground" />
          <span className="truncate flex-1">
            Replying to {replyTo.sender?.full_name || "message"}: {replyTo.message.slice(0, 50)}
          </span>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setReplyTo(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Selected file indicator */}
      {selectedFile && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/50 border-t text-xs">
          <Paperclip className="h-3 w-3 text-muted-foreground" />
          <span className="truncate flex-1">{selectedFile.name}</span>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setSelectedFile(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Voice recording preview */}
      {audioPreview && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-t text-xs">
          <Mic className="h-3 w-3 text-destructive" />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={togglePreviewPlayback}>
            {isPlayingPreview ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </Button>
          <span className="flex-1 text-muted-foreground">Voice message ({formatDuration(recordingDuration)})</span>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={cancelRecording}>
            <X className="h-3 w-3" />
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs" disabled={sending} onClick={sendVoiceMessage}>
            <Send className="h-3 w-3 mr-1" /> Send
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-center gap-2 px-4 py-3 border-t">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
          }}
        />
        
        {isRecording ? (
          <>
            <div className="flex items-center gap-2 flex-1">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm text-destructive font-medium">Recording {formatDuration(recordingDuration)}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelRecording}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-8 w-8 bg-destructive hover:bg-destructive/90" onClick={stopRecording}>
              <Square className="h-4 w-4" />
            </Button>
          </>
        ) : audioPreview ? null : (
          <>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              className="h-9"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startRecording} disabled={!!selectedFile}>
              <Mic className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-8 w-8" disabled={sending || (!messageText.trim() && !selectedFile)} onClick={sendMessage}>
              <Send className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

// Hook to get unread message counts per task for the current user
export const useUnreadMessageCounts = (taskIds: string[]) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["unread-message-counts", user?.id, taskIds],
    queryFn: async () => {
      if (!user?.id || !taskIds.length) return new Map<string, number>();

      // Get all messages for these tasks NOT sent by current user
      const { data: messages, error: msgError } = await supabase
        .from("order_messages")
        .select("id, task_id")
        .in("task_id", taskIds)
        .neq("sender_id", user.id);
      if (msgError) throw msgError;
      if (!messages?.length) return new Map<string, number>();

      // Get read records for current user
      const messageIds = messages.map(m => m.id);
      const { data: reads, error: readError } = await supabase
        .from("order_message_reads")
        .select("message_id")
        .in("message_id", messageIds)
        .eq("user_id", user.id);
      if (readError) throw readError;

      const readSet = new Set(reads?.map(r => r.message_id) || []);
      const counts = new Map<string, number>();
      for (const msg of messages) {
        if (!readSet.has(msg.id)) {
          counts.set(msg.task_id, (counts.get(msg.task_id) || 0) + 1);
        }
      }
      return counts;
    },
    enabled: !!user?.id && taskIds.length > 0,
    refetchInterval: 30000, // Refresh every 30s
  });
};
