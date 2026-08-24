"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  acceptedSelectedWorkImageTypes,
  maxSelectedWorkImageBytes,
  selectedWorkImageClass,
  selectedWorkImageContainerClass,
  selectedWorkImageFrameClass,
  selectedWorkImageOverlayClass,
} from "@/config/selected-work-ui";
import type { SelectedWorkRecord } from "@/lib/selected-work/types";
import {
  removeSelectedWork,
  toggleSelectedWorkVisibility,
  updateSelectedWorkOrder,
  upsertSelectedWork,
} from "@/app/admin/(dashboard)/selected-work/actions";

type SelectedWorkManagerProps = {
  initialItems: SelectedWorkRecord[];
  loadError?: string | null;
};

type FormState = {
  id?: string;
  title: string;
  description: string;
  isActive: boolean;
  imageFile: File | null;
  currentImageUrl: string;
};

function SelectedWorkThumbnail({
  imageUrl,
  alt,
}: {
  imageUrl: string | null;
  alt: string;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const shouldShowImage = Boolean(imageUrl?.trim()) && !hasImageError;

  return (
    <div className="relative h-20 w-16 shrink-0 overflow-hidden border border-border bg-background sm:h-24 sm:w-[4.5rem]">
      {shouldShowImage ? (
        <img
          src={imageUrl ?? ""}
          alt={alt}
          className="h-full w-full object-cover object-center"
          draggable={false}
          onError={() => setHasImageError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-2 text-center">
          <span className="font-primary text-[10px] uppercase tracking-[0.18em] text-foreground-muted">
            No image
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-black/10" />
    </div>
  );
}

const blankForm: FormState = {
  title: "",
  description: "",
  isActive: true,
  imageFile: null,
  currentImageUrl: "",
};

function toFormState(item: SelectedWorkRecord): FormState {
  return {
    id: item.id,
    title: item.title ?? "",
    description: item.description ?? "",
    isActive: item.is_active,
    imageFile: null,
    currentImageUrl: item.image_url,
  };
}

export default function SelectedWorkManager({
  initialItems,
  loadError,
}: SelectedWorkManagerProps) {
  const router = useRouter();
  const [formState, setFormState] = useState<FormState | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderedItems, setOrderedItems] = useState<SelectedWorkRecord[]>([]);

  const items = useMemo(
    () =>
      [...initialItems].sort(
        (first, second) =>
          first.sort_order - second.sort_order,
      ),
    [initialItems],
  );

  useEffect(() => {
    if (!formState) {
      setPreviewUrl("");
      return;
    }

    if (!formState.imageFile) {
      setPreviewUrl(formState.currentImageUrl);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(formState.imageFile);
    setPreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [formState]);

  useEffect(() => {
    if (!formState?.id) {
      return;
    }

    const row = rowRefs.current[formState.id];
    if (!row) {
      return;
    }

    const rect = row.getBoundingClientRect();
    const isOutOfView = rect.top < 96 || rect.bottom > window.innerHeight - 32;

    if (isOutOfView) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [formState?.id]);

  function openCreateForm() {
    setFeedback("");
    setFormState({ ...blankForm });
  }

  function openEditForm(item: SelectedWorkRecord) {
    setFeedback("");
    setIsDragOver(false);
    setFormState(toFormState(item));
  }

  function closeForm() {
    setFormState(null);
    setFeedback("");
    setIsDragOver(false);
  }

  function isValidImageFile(file: File) {
    return acceptedSelectedWorkImageTypes.includes(
      file.type as (typeof acceptedSelectedWorkImageTypes)[number],
    );
  }

  function setSelectedImage(file: File | null) {
    if (!formState) {
      return;
    }

    if (!file) {
      setFormState((current) =>
        current
          ? {
              ...current,
              imageFile: null,
            }
          : current,
      );
      setFeedback("");
      return;
    }

    if (!isValidImageFile(file)) {
      setFeedback("Use a JPG, JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > maxSelectedWorkImageBytes) {
      setFeedback("Image must be 8 MB or smaller.");
      return;
    }

    setFeedback("");
    setFormState((current) =>
      current
        ? {
            ...current,
            imageFile: file,
          }
        : current,
    );
  }

  function saveForm() {
    if (!formState) {
      return;
    }

    setFeedback("");

    startTransition(async () => {
      const payload = new FormData();
      if (formState.id) {
        payload.set("id", formState.id);
      }
      payload.set("title", formState.title);
      payload.set("description", formState.description);
      payload.set("isActive", String(formState.isActive));
      payload.set("currentImageUrl", formState.currentImageUrl);

      if (formState.imageFile) {
        payload.set("image", formState.imageFile);
      }

      const result = await upsertSelectedWork(payload);

      if ("error" in result) {
        setFeedback(result.error ?? "Unexpected server error.");
        return;
      }

      closeForm();
      router.refresh();
    });
  }

  function handleToggle(id: string, nextValue: boolean) {
    setFeedback("");

    startTransition(async () => {
      const result = await toggleSelectedWorkVisibility(id, nextValue);

      if ("error" in result) {
        setFeedback(result.error ?? "Unexpected server error.");
        return;
      }

      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Delete this work item?")) {
      return;
    }

    setFeedback("");

    startTransition(async () => {
      const result = await removeSelectedWork(id);

      if ("error" in result) {
        setFeedback(result.error ?? "Unexpected server error.");
        return;
      }

      router.refresh();
    });
  }

  function openOrderModal() {
    setFeedback("");
    setOrderedItems(items);
    setIsOrderModalOpen(true);
  }

  function closeOrderModal() {
    setIsOrderModalOpen(false);
    setOrderedItems([]);
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    setOrderedItems((current) => {
      const index = current.findIndex((item) => item.id === itemId);

      if (index === -1) {
        return current;
      }

      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const nextItems = [...current];
      const [movedItem] = nextItems.splice(index, 1);
      nextItems.splice(nextIndex, 0, movedItem);
      return nextItems;
    });
  }

  function saveOrder() {
    setFeedback("");

    startTransition(async () => {
      const result = await updateSelectedWorkOrder(
        orderedItems.map((item) => item.id),
      );

      if ("error" in result) {
        setFeedback(result.error ?? "Unexpected server error.");
        return;
      }

      closeOrderModal();
      router.refresh();
    });
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function renderForm(mode: "create" | "edit") {
    if (!formState) {
      return null;
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
            {mode === "edit" ? "Edit Work" : "Add Work"}
          </h2>
          <button
            type="button"
            onClick={closeForm}
            className="font-primary text-xs uppercase tracking-[0.22em] text-foreground-muted transition-colors hover:text-foreground-secondary"
          >
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] xl:items-start">
          <div className="grid grid-cols-1 gap-5">
            <label className="space-y-3">
              <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                Title
              </span>
              <input
                type="text"
                value={formState.title}
                onChange={(event) =>
                  setFormState((current) =>
                    current
                      ? {
                          ...current,
                          title: event.target.value,
                        }
                      : current,
                  )
                }
                className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
                placeholder="Optional title"
              />
            </label>

            <label className="space-y-3">
              <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                Description
              </span>
              <textarea
                rows={5}
                value={formState.description}
                onChange={(event) =>
                  setFormState((current) =>
                    current
                      ? {
                          ...current,
                          description: event.target.value,
                        }
                      : current,
                  )
                }
                className="w-full resize-none border border-border bg-transparent px-4 py-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
                placeholder="Optional supporting text"
              />
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formState.isActive}
                onChange={(event) =>
                  setFormState((current) =>
                    current
                      ? {
                          ...current,
                          isActive: event.target.checked,
                        }
                      : current,
                  )
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary">
                Active / Visible
              </span>
            </label>
          </div>

          <div className="space-y-3">
            <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
              Work Image
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedSelectedWorkImageTypes.join(",")}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setSelectedImage(nextFile);
                event.currentTarget.value = "";
              }}
              className="sr-only"
            />
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload selected work image"
              onClick={openFilePicker}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openFilePicker();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                const relatedTarget = event.relatedTarget as Node | null;
                if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
                  return;
                }
                setIsDragOver(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragOver(false);
                const nextFile = event.dataTransfer.files?.[0] ?? null;
                setSelectedImage(nextFile);
              }}
              className={`space-y-4 border px-4 py-4 outline-none transition-colors ${
                isDragOver
                  ? "border-accent bg-background-secondary"
                  : "border-border bg-background hover:border-foreground-secondary"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-primary text-sm uppercase tracking-[0.18em] text-foreground">
                    Drop image here or click to upload
                  </p>
                  <p className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
                    JPG, JPEG, PNG, or WebP · max 8 MB
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openFilePicker();
                    }}
                    className="inline-flex min-h-10 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
                  >
                    {previewUrl ? "Change image" : "Select image"}
                  </button>
                  {formState.imageFile ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedImage(null);
                      }}
                      className="inline-flex min-h-10 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-muted transition-colors hover:text-foreground"
                    >
                      Clear new image
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                  Preview
                </span>
                <div className={selectedWorkImageContainerClass}>
                  <div className={selectedWorkImageFrameClass}>
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={formState.title || "Selected work preview"}
                        className={selectedWorkImageClass}
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center">
                        <p className="font-primary text-sm uppercase tracking-[0.18em] text-foreground-muted">
                          No image selected yet
                        </p>
                      </div>
                    )}
                    <div className={selectedWorkImageOverlayClass} />
                  </div>
                </div>
                {formState.currentImageUrl && !formState.imageFile ? (
                  <p className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                    Current website image preview
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={closeForm}
            className="inline-flex min-h-12 items-center justify-center border border-border px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={saveForm}
            className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
          >
            {isPending ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Work"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-4">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            Portfolio
          </p>
          <div className="space-y-2">
            <h1 className="font-display text-[clamp(2.2rem,5vw,4.25rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
              Selected Work
            </h1>
            <p className="max-w-2xl font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
              Manage the public gallery images, copy, visibility, and ordering.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={openOrderModal}
            className="inline-flex min-h-12 items-center justify-center border border-border px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
          >
            Edit Order
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover"
          >
            + Add Work
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="border border-border bg-surface px-5 py-5">
          <p className="font-primary text-sm leading-7 text-foreground-secondary">
            {loadError}
          </p>
        </div>
      ) : null}

      {feedback ? (
        <div className="border border-border bg-surface px-5 py-4">
          <p className="font-primary text-sm text-foreground-secondary">
            {feedback}
          </p>
        </div>
      ) : null}

      {formState && !formState.id ? (
        <div className="space-y-6 border border-border bg-surface px-5 py-6 sm:px-6">
          {renderForm("create")}
        </div>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => (
          <article
            key={item.id}
            className="border border-border bg-surface px-5 py-5 sm:px-6"
            ref={(node) => {
              rowRefs.current[item.id] = node;
            }}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4 sm:gap-5">
                <SelectedWorkThumbnail
                  imageUrl={item.image_url}
                  alt={item.title || "Selected work thumbnail"}
                />

                <div className="min-w-0 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <h2 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
                      {item.title || "Untitled Work"}
                    </h2>
                    <span className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                      Order {item.sort_order}
                    </span>
                  </div>

                  <p className="max-w-2xl font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
                    {item.description || "No description set."}
                  </p>

                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <p className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                      {item.image_url ? "Image uploaded" : "No image"}
                    </p>
                    <p className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                      {item.is_active ? "Visible on website" : "Hidden from website"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
                <button
                  type="button"
                  onClick={() => handleToggle(item.id, !item.is_active)}
                  className={`inline-flex min-h-11 items-center justify-center border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] transition-colors ${
                    item.is_active
                      ? "border-border bg-background text-foreground"
                      : "border-border bg-transparent text-foreground-secondary hover:text-foreground"
                  }`}
                >
                  {item.is_active ? "Visible" : "Hidden"}
                </button>
                <button
                  type="button"
                  onClick={() => openEditForm(item)}
                  className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                >
                  {formState?.id === item.id ? "Editing" : "Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-muted transition-colors hover:text-error"
                >
                  Delete
                </button>
              </div>
            </div>

            {formState?.id === item.id ? (
              <div className="mt-6 border-t border-border pt-6">
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeForm}
                    aria-label="Collapse work editor"
                    className="inline-flex h-11 w-11 items-center justify-center border border-border text-lg text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                  >
                    ↑
                  </button>
                </div>
                {renderForm("edit")}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {isOrderModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="w-full max-w-2xl border border-border bg-surface px-5 py-6 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                  Selected Work
                </p>
                <h2 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
                  Edit Order
                </h2>
                <p className="font-primary text-sm leading-7 text-foreground-secondary">
                  Reorder work items, then save to apply sequential sort values.
                </p>
              </div>
              <button
                type="button"
                onClick={closeOrderModal}
                className="font-primary text-xs uppercase tracking-[0.22em] text-foreground-muted transition-colors hover:text-foreground-secondary"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {orderedItems.map((item, index) => {
                const isFirst = index === 0;
                const isLast = index === orderedItems.length - 1;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 border border-border bg-background px-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted">
                        {String(index + 1).padStart(2, "0")}
                      </p>
                      <p className="font-display text-xl uppercase tracking-[-0.04em] text-foreground">
                        {item.title || "Untitled Work"}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, -1)}
                        disabled={isFirst || isPending}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border px-3 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, 1)}
                        disabled={isLast || isPending}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border px-3 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted"
                      >
                        Down
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeOrderModal}
                className="inline-flex min-h-12 items-center justify-center border border-border px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={saveOrder}
                className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-background-secondary disabled:text-foreground-muted"
              >
                {isPending ? "Saving..." : "Save Order"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
