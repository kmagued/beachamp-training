"use client";

import { useTransition } from "react";
import { Card, Badge, EmptyState, Button } from "@/components/ui";
import { Bell, CheckCheck } from "lucide-react";
import { markNotificationRead, markAllNotificationsRead } from "@/app/_actions/notifications";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function typeBadge(type: string) {
  switch (type) {
    case "payment": return <Badge variant="success">Payment</Badge>;
    case "subscription": return <Badge variant="info">Subscription</Badge>;
    case "session": return <Badge variant="warning">Session</Badge>;
    case "private_session": return <Badge variant="info">Private</Badge>;
    case "reminder": return <Badge variant="warning">Reminder</Badge>;
    default: return <Badge variant="neutral">System</Badge>;
  }
}

export function NotificationInbox({ notifications }: { notifications: NotificationItem[] }) {
  const [isPending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  return (
    <div>
      {unreadCount > 0 && (
        <div className="flex justify-end mb-3">
          <Button size="sm" variant="secondary" onClick={handleMarkAllRead} disabled={isPending}>
            <span className="flex items-center gap-1.5">
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </span>
          </Button>
        </div>
      )}

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-12 h-12" />}
          title="No Notifications"
          description="You're all caught up!"
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`p-4 transition-colors ${!n.is_read ? "bg-blue-50/50 border-blue-100" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {typeBadge(n.type)}
                    <span className="text-[10px] text-slate-400">{timeAgo(n.created_at)}</span>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-900">{n.title}</p>
                  {n.body && <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>}
                </div>
                {!n.is_read && (
                  <button
                    onClick={() => handleMarkRead(n.id)}
                    disabled={isPending}
                    className="text-[10px] text-slate-400 hover:text-slate-600 shrink-0 mt-1"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
