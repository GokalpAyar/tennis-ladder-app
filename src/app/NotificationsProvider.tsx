import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type AppNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};

type NotificationsContextValue = {
  addNotification: (title: string, message: string) => void;
  markAllRead: () => void;
  notifications: AppNotification[];
  unreadCount: number;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [visibleToasts, setVisibleToasts] = useState<AppNotification[]>([]);

  const addNotification = useCallback((title: string, message: string) => {
    const notification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      message,
      createdAt: new Date().toISOString(),
      isRead: false,
    };

    setNotifications((current) => [notification, ...current].slice(0, 20));
    setVisibleToasts((current) => [notification, ...current].slice(0, 2));
    window.setTimeout(() => {
      setVisibleToasts((current) =>
        current.filter((toast) => toast.id !== notification.id),
      );
    }, 4500);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, isRead: true })),
    );
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  const value = useMemo(
    () => ({
      addNotification,
      markAllRead,
      notifications,
      unreadCount,
    }),
    [addNotification, markAllRead, notifications, unreadCount],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <NotificationToasts notifications={visibleToasts} />
    </NotificationsContext.Provider>
  );
}

function NotificationToasts({ notifications }: { notifications: AppNotification[] }) {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 grid w-[min(22rem,calc(100vw-2rem))] gap-2">
      {notifications.map((notification) => (
        <div
          className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-ink-900 shadow-xl"
          key={notification.id}
          role="status"
        >
          <p className="font-black">{notification.title}</p>
          <p className="mt-1 font-semibold text-ink-700">{notification.message}</p>
        </div>
      ))}
    </div>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error('useNotifications must be used inside NotificationsProvider.');
  }

  return context;
}
