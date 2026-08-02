import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useCollabPosts, type CollabPost } from "../data/useCollabPosts";
import {
  COLLAB_CATEGORIES,
  CONTACT_METHODS,
  MAX_OPEN_COLLAB_POSTS,
  type CollabCategory,
  type ContactMethod,
} from "../lib/collab";
import { Sheet } from "../components/Sheet";

const CATEGORY_LABEL: Record<CollabCategory, string> = Object.fromEntries(
  COLLAB_CATEGORIES.map((c) => [c.key, c.label])
) as Record<CollabCategory, string>;

const CONTACT_LABEL: Record<ContactMethod, string> = Object.fromEntries(
  CONTACT_METHODS.map((c) => [c.key, c.label])
) as Record<ContactMethod, string>;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type Tab = "browse" | "mine";

export function CollabBoardPage() {
  const { user, profile } = useAuth();
  const { posts, loading, error, addPost, updatePost, removePost, reportPost } = useCollabPosts(user?.id);

  const [tab, setTab] = useState<Tab>("browse");
  const [categoryFilter, setCategoryFilter] = useState<CollabCategory | "all">("all");
  const [showForm, setShowForm] = useState<CollabPost | null | "new">(null);
  const [reportingPost, setReportingPost] = useState<CollabPost | null>(null);

  const openPosts = useMemo(() => posts.filter((p) => p.status === "open"), [posts]);
  const browsePosts = useMemo(
    () => (categoryFilter === "all" ? openPosts : openPosts.filter((p) => p.category === categoryFilter)),
    [openPosts, categoryFilter]
  );
  const myPosts = useMemo(() => posts.filter((p) => p.user_id === user?.id), [posts, user?.id]);
  const myOpenCount = useMemo(() => myPosts.filter((p) => p.status === "open").length, [myPosts]);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px 60px" }}>
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Collab Board</div>
      <div style={{ textAlign: "center", fontSize: 11, color: "#4b4f5c", marginBottom: 20 }}>
        find collaborators, reach out directly — no in-app messaging
      </div>

      {error && (
        <div className="grind-card" style={{ padding: 14, marginBottom: 16, fontSize: 12, color: "var(--rose)" }}>
          Couldn't load the board: {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["browse", "mine"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: tab === t ? "1px solid var(--ember)" : "1px solid var(--border)",
              background: tab === t ? "rgba(232,163,61,0.14)" : "var(--surface-2)",
              color: "var(--text)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t === "browse" ? "Browse" : "My Posts"}
          </button>
        ))}
      </div>

      {tab === "browse" ? (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {(["all", ...COLLAB_CATEGORIES.map((c) => c.key)] as const).map((key) => {
              const active = categoryFilter === key;
              const label = key === "all" ? "All" : CATEGORY_LABEL[key as CollabCategory];
              return (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(key as CollabCategory | "all")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: active ? "1px solid var(--ember)" : "1px solid var(--border)",
                    background: active ? "rgba(232,163,61,0.14)" : "var(--surface-2)",
                    color: "var(--text)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="grind-card" style={{ padding: 24, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
              Loading...
            </div>
          ) : browsePosts.length === 0 ? (
            <div className="grind-card" style={{ padding: 24, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
              Nothing open here yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {browsePosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isOwn={post.user_id === user?.id}
                  onReport={() => setReportingPost(post)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: "var(--muted-2)" }}>
              {myOpenCount}/{MAX_OPEN_COLLAB_POSTS} open posts
            </span>
            <button
              onClick={() => setShowForm("new")}
              disabled={myOpenCount >= MAX_OPEN_COLLAB_POSTS}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                fontWeight: 700,
                fontSize: 12,
                cursor: myOpenCount >= MAX_OPEN_COLLAB_POSTS ? "default" : "pointer",
                background: myOpenCount >= MAX_OPEN_COLLAB_POSTS ? "var(--surface-2)" : "var(--ember)",
                color: myOpenCount >= MAX_OPEN_COLLAB_POSTS ? "#4b4f5c" : "#12141c",
              }}
            >
              + New post
            </button>
          </div>

          {loading ? (
            <div className="grind-card" style={{ padding: 24, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
              Loading...
            </div>
          ) : myPosts.length === 0 ? (
            <div className="grind-card" style={{ padding: 24, textAlign: "center", color: "var(--muted-2)", fontSize: 13 }}>
              You haven't posted anything yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myPosts.map((post) => (
                <MyPostCard
                  key={post.id}
                  post={post}
                  onEdit={() => setShowForm(post)}
                  onToggleStatus={() => updatePost(post.id, { status: post.status === "open" ? "closed" : "open" })}
                  onDelete={() => removePost(post.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <PostFormSheet
          existing={showForm === "new" ? null : showForm}
          posterDisplayName={profile?.display_name ?? profile?.username ?? null}
          onClose={() => setShowForm(null)}
          onSubmit={async (fields) => {
            const message =
              showForm === "new" ? await addPost(fields) : await updatePost(showForm.id, fields);
            if (!message) setShowForm(null);
            return message;
          }}
        />
      )}

      {reportingPost && (
        <ReportSheet
          post={reportingPost}
          onClose={() => setReportingPost(null)}
          onSubmit={async (reason) => {
            const message = await reportPost(reportingPost.id, reason);
            if (!message) setReportingPost(null);
            return message;
          }}
        />
      )}
    </div>
  );
}

function ContactInfo({ post }: { post: CollabPost }) {
  if (!post.contact_method || !post.contact_value) {
    return <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 6 }}>No contact info shared</div>;
  }
  return (
    <div style={{ fontSize: 12, color: "var(--teal)", marginTop: 6, fontWeight: 600 }}>
      {CONTACT_LABEL[post.contact_method]}: {post.contact_value}
    </div>
  );
}

function PostCard({ post, isOwn, onReport }: { post: CollabPost; isOwn: boolean; onReport: () => void }) {
  return (
    <div className="grind-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "var(--ember)",
            border: "1px solid var(--ember)",
            borderRadius: 6,
            padding: "1px 5px",
            flexShrink: 0,
          }}
        >
          {CATEGORY_LABEL[post.category]}
        </span>
        <span style={{ fontSize: 10, color: "var(--muted-2)" }}>{timeAgo(post.created_at)}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{post.title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{post.description}</div>
      <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 8 }}>
        — {post.poster_display_name ?? "a GRIND artist"}
      </div>
      <ContactInfo post={post} />
      {!isOwn && (
        <button
          onClick={onReport}
          style={{
            background: "none",
            border: "none",
            color: "var(--muted-2)",
            cursor: "pointer",
            fontSize: 10,
            padding: 0,
            marginTop: 10,
            textDecoration: "underline",
          }}
        >
          Report
        </button>
      )}
    </div>
  );
}

function MyPostCard({
  post,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  post: CollabPost;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="grind-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "var(--ember)",
            border: "1px solid var(--ember)",
            borderRadius: 6,
            padding: "1px 5px",
            flexShrink: 0,
          }}
        >
          {CATEGORY_LABEL[post.category]}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: post.status === "open" ? "var(--teal)" : "var(--muted-2)",
            border: `1px solid ${post.status === "open" ? "var(--teal)" : "var(--border)"}`,
            borderRadius: 6,
            padding: "1px 5px",
          }}
        >
          {post.status === "open" ? "OPEN" : "CLOSED"}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{post.title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>{post.description}</div>
      <ContactInfo post={post} />
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        <button onClick={onEdit} style={linkButtonStyle}>
          Edit
        </button>
        <button onClick={onToggleStatus} style={linkButtonStyle}>
          {post.status === "open" ? "Mark closed" : "Reopen"}
        </button>
        <button onClick={onDelete} style={{ ...linkButtonStyle, color: "var(--rose)" }}>
          Delete
        </button>
      </div>
    </div>
  );
}

const linkButtonStyle = {
  background: "none",
  border: "none",
  color: "var(--muted-2)",
  cursor: "pointer",
  fontSize: 11,
  padding: 0,
  textDecoration: "underline",
} as const;

function PostFormSheet({
  existing,
  posterDisplayName,
  onClose,
  onSubmit,
}: {
  existing: CollabPost | null;
  posterDisplayName: string | null;
  onClose: () => void;
  onSubmit: (fields: {
    category: CollabCategory;
    title: string;
    description: string;
    contactMethod: ContactMethod | null;
    contactValue: string | null;
    posterDisplayName: string | null;
  }) => Promise<string | null>;
}) {
  const [category, setCategory] = useState<CollabCategory>(existing?.category ?? COLLAB_CATEGORIES[0].key);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [shareContact, setShareContact] = useState(Boolean(existing?.contact_method));
  const [contactMethod, setContactMethod] = useState<ContactMethod>(existing?.contact_method ?? "instagram");
  const [contactValue, setContactValue] = useState(existing?.contact_value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await onSubmit({
      category,
      title: title.trim(),
      description: description.trim(),
      contactMethod: shareContact ? contactMethod : null,
      contactValue: shareContact ? contactValue.trim() : null,
      posterDisplayName,
    });
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <form onSubmit={submit}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          {existing ? "Edit post" : "New Collab Board post"}
        </div>

        <select value={category} onChange={(e) => setCategory(e.target.value as CollabCategory)} style={{ ...inputStyle, width: "100%", marginBottom: 8 }}>
          {COLLAB_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>

        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
        />

        <textarea
          placeholder="What are you looking for? Genre, deadline, anything relevant."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          style={{ ...inputStyle, width: "100%", marginBottom: 12, resize: "vertical" }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted-2)", marginBottom: shareContact ? 8 : 4, cursor: "pointer" }}>
          <input type="checkbox" checked={shareContact} onChange={(e) => setShareContact(e.target.checked)} />
          Share contact info on this post
        </label>

        {shareContact && (
          <>
            <div style={{ fontSize: 11, color: "var(--rose)", marginBottom: 8 }}>
              This will be visible to anyone using GRIND, not just people you match with.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8, marginBottom: 12 }}>
              <select value={contactMethod} onChange={(e) => setContactMethod(e.target.value as ContactMethod)} style={inputStyle}>
                {CONTACT_METHODS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                placeholder="@handle, email, etc."
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                required={shareContact}
                style={inputStyle}
              />
            </div>
          </>
        )}

        {error && <div style={{ color: "var(--rose)", fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            cursor: busy ? "default" : "pointer",
            background: "var(--ember)",
            color: "#12141c",
          }}
        >
          {busy ? "..." : existing ? "Save changes" : "Post it"}
        </button>
      </form>
    </Sheet>
  );
}

function ReportSheet({
  post,
  onClose,
  onSubmit,
}: {
  post: CollabPost;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await onSubmit(reason);
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <form onSubmit={submit}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Report "{post.title}"</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
          Sent directly to GRIND for review - not to the poster.
        </div>
        <textarea
          placeholder="What's wrong with this post? (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          style={{ ...inputStyle, width: "100%", marginBottom: 12, resize: "vertical" }}
        />
        {error && <div style={{ color: "var(--rose)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            cursor: busy ? "default" : "pointer",
            background: "var(--rose)",
            color: "#12141c",
          }}
        >
          {busy ? "..." : "Submit report"}
        </button>
      </form>
    </Sheet>
  );
}

const inputStyle = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 13,
} as const;
