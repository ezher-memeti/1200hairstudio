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
  acceptedServiceImageTypes,
  serviceImageClass,
  serviceImageContainerClass,
  serviceImageFrameClass,
  serviceImageOverlayClass,
} from "@/config/service-ui";
import type { ServiceRecord } from "@/lib/services/types";
import {
  removeService,
  toggleServiceVisibility,
  updateServiceOrder,
  upsertService,
} from "@/app/admin/(dashboard)/services/actions";

type SiteSettingsServicesManagerProps = {
  initialServices: ServiceRecord[];
  loadError?: string | null;
};

type FormState = {
  id?: string;
  name: string;
  description: string;
  price: string;
  durationMin: string;
  durationMax: string;
  isActive: boolean;
  imageFile: File | null;
  currentImageUrl: string;
};

const blankForm: FormState = {
  name: "",
  description: "",
  price: "",
  durationMin: "",
  durationMax: "",
  isActive: true,
  imageFile: null,
  currentImageUrl: "",
};

function toFormState(service: ServiceRecord): FormState {
  return {
    id: service.id,
    name: service.name,
    description: service.description ?? "",
    price: String(service.price),
    durationMin: String(service.duration_min),
    durationMax: service.duration_max
      ? String(service.duration_max)
      : "",
    isActive: service.is_active,
    imageFile: null,
    currentImageUrl: service.image_url ?? "",
  };
}

export default function SiteSettingsServicesManager({
  initialServices,
  loadError,
}: SiteSettingsServicesManagerProps) {
  const router = useRouter();
  const [formState, setFormState] = useState<FormState | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const serviceRowRefs = useRef<
    Record<string, HTMLElement | null>
  >({});
  const [isOrderModalOpen, setIsOrderModalOpen] =
    useState(false);
  const [orderedServices, setOrderedServices] = useState<
    ServiceRecord[]
  >([]);

  const services = useMemo(
    () =>
      [...initialServices].sort(
        (first, second) =>
          first.sort_order - second.sort_order,
      ),
    [initialServices],
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

  function openCreateForm() {
    setFeedback("");
    setFormState({
      ...blankForm,
    });
  }

  function openEditForm(service: ServiceRecord) {
    setFeedback("");
    setIsDragOver(false);
    setFormState(toFormState(service));
  }

  function closeForm() {
    setFormState(null);
    setFeedback("");
    setIsDragOver(false);
  }

  function isValidImageFile(file: File) {
    return acceptedServiceImageTypes.includes(
      file.type as (typeof acceptedServiceImageTypes)[number],
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
      payload.set("name", formState.name);
      payload.set("description", formState.description);
      payload.set("price", formState.price);
      payload.set("durationMin", formState.durationMin);
      payload.set("durationMax", formState.durationMax);
      payload.set("isActive", String(formState.isActive));
      payload.set("currentImageUrl", formState.currentImageUrl);

      if (formState.imageFile) {
        payload.set("image", formState.imageFile);
      }

      const result = await upsertService(payload);

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      closeForm();
      router.refresh();
    });
  }

  function handleToggle(id: string, nextValue: boolean) {
    setFeedback("");

    startTransition(async () => {
      const result = await toggleServiceVisibility(
        id,
        nextValue,
      );

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Delete this service?")) {
      return;
    }

    setFeedback("");

    startTransition(async () => {
      const result = await removeService(id);

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      router.refresh();
    });
  }

  function openOrderModal() {
    setFeedback("");
    setOrderedServices(services);
    setIsOrderModalOpen(true);
  }

  function closeOrderModal() {
    setIsOrderModalOpen(false);
    setOrderedServices([]);
  }

  function moveService(serviceId: string, direction: -1 | 1) {
    setOrderedServices((current) => {
      const index = current.findIndex(
        (service) => service.id === serviceId,
      );

      if (index === -1) {
        return current;
      }

      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const nextServices = [...current];
      const [movedService] = nextServices.splice(index, 1);
      nextServices.splice(nextIndex, 0, movedService);
      return nextServices;
    });
  }

  function saveOrder() {
    setFeedback("");

    startTransition(async () => {
      const result = await updateServiceOrder(
        orderedServices.map((service) => service.id),
      );

      if (result.error) {
        setFeedback(result.error);
        return;
      }

      closeOrderModal();
      router.refresh();
    });
  }

  function formatServiceDuration(service: ServiceRecord) {
    if (
      service.duration_max === null ||
      service.duration_max === service.duration_min
    ) {
      return `${service.duration_min} MIN`;
    }

    return `${service.duration_min}–${service.duration_max} MIN`;
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  useEffect(() => {
    if (!formState?.id) {
      return;
    }

    const serviceRow = serviceRowRefs.current[formState.id];

    if (!serviceRow) {
      return;
    }

    const rect = serviceRow.getBoundingClientRect();
    const isOutOfView =
      rect.top < 96 ||
      rect.bottom >
        window.innerHeight - 32;

    if (isOutOfView) {
      serviceRow.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [formState?.id]);

  function renderServiceForm(mode: "create" | "edit") {
    if (!formState) {
      return null;
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
            {mode === "edit" ? "Edit Service" : "Add Service"}
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {[
              ["name", "Name", "text"],
              ["price", "Price", "number"],
              ["durationMin", "Minimum Duration (min)", "number"],
              ["durationMax", "Maximum Duration (min · optional)", "number"],
            ].map(([field, label, type]) => (
              <label key={field} className="space-y-3">
                <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                  {label}
                </span>
                <input
                  type={type}
                  value={
                    formState[
                      field as keyof Omit<FormState, "imageFile">
                    ] as string
                  }
                  onChange={(event) =>
                    setFormState((current) =>
                      current
                        ? {
                            ...current,
                            [field]: event.target.value,
                          }
                        : current,
                    )
                  }
                  className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
                  placeholder={
                    field === "durationMax"
                      ? "Optional"
                      : undefined
                  }
                />
              </label>
            ))}

            <label className="space-y-3 sm:col-span-2">
              <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
                Description
              </span>
              <textarea
                rows={4}
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
              />
            </label>

            <label className="flex items-center gap-3 sm:col-span-2">
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
              Service Image
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedServiceImageTypes.join(",")}
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
              aria-label="Upload service image"
              onClick={openFilePicker}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " "
                ) {
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
                const relatedTarget =
                  event.relatedTarget as Node | null;

                if (
                  relatedTarget &&
                  event.currentTarget.contains(relatedTarget)
                ) {
                  return;
                }

                setIsDragOver(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragOver(false);
                const nextFile =
                  event.dataTransfer.files?.[0] ?? null;
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
                    JPG, JPEG, PNG, or WebP
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
                    {previewUrl
                      ? "Change image"
                      : "Select image"}
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
                <div className={serviceImageContainerClass}>
                  <div className={serviceImageFrameClass}>
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={formState.name || "Service preview"}
                        className={serviceImageClass}
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center">
                        <p className="font-primary text-sm uppercase tracking-[0.18em] text-foreground-muted">
                          No image selected yet
                        </p>
                      </div>
                    )}
                    <div className={serviceImageOverlayClass} />
                  </div>
                </div>
                {formState.currentImageUrl &&
                !formState.imageFile ? (
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
            {isPending
              ? "Saving..."
              : mode === "edit"
                ? "Save Changes"
                : "Create Service"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h2 className="font-admin-display text-2xl font-semibold text-foreground">
            Services
          </h2>
          <p className="max-w-2xl font-admin-primary text-sm leading-6 text-foreground-secondary">
            Manage pricing, duration, visibility, and ordering.
          </p>
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
            + Add Service
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
          {renderServiceForm("create")}
        </div>
      ) : null}

      <div className="space-y-4">
        {services.map((service) => (
          <article
            key={service.id}
            className="border border-border bg-surface px-5 py-5 sm:px-6"
            ref={(node) => {
              serviceRowRefs.current[service.id] = node;
            }}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <h2 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground">
                    {service.name}
                  </h2>
                  <span className="font-primary text-sm uppercase tracking-[0.2em] text-foreground-secondary">
                    CHF {service.price.toFixed(0)}
                  </span>
                </div>

                <p className="max-w-2xl font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
                  {service.description || "No description set."}
                </p>

                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <p className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                    Duration: {formatServiceDuration(service)}
                  </p>
                  <p className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                    Order: {service.sort_order}
                  </p>
                  <p className="font-primary text-xs uppercase tracking-[0.2em] text-foreground-muted">
                    {service.image_url ? "Image uploaded" : "No image"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    handleToggle(service.id, !service.is_active)
                  }
                  className={`inline-flex min-h-11 items-center justify-center border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] transition-colors ${
                    service.is_active
                      ? "border-border bg-background text-foreground"
                      : "border-border bg-transparent text-foreground-secondary hover:text-foreground"
                  }`}
                >
                  {service.is_active ? "Visible" : "Hidden"}
                </button>
                <button
                  type="button"
                  onClick={() => openEditForm(service)}
                  className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                >
                  {formState?.id === service.id
                    ? "Editing"
                    : "Edit"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(service.id)}
                  className="inline-flex min-h-11 items-center justify-center border border-border px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground-muted transition-colors hover:text-error"
                >
                  Delete
                </button>
              </div>
            </div>

            {formState?.id === service.id ? (
              <div className="mt-6 border-t border-border pt-6">
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeForm}
                    aria-label="Collapse service editor"
                    className="inline-flex h-11 w-11 items-center justify-center border border-border text-lg text-foreground-secondary transition-colors hover:bg-background hover:text-foreground"
                  >
                    ↑
                  </button>
                </div>
                {renderServiceForm("edit")}
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
                  Services
                </p>
                <h2 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
                  Edit Order
                </h2>
                <p className="font-primary text-sm leading-7 text-foreground-secondary">
                  Reorder services, then save to apply sequential
                  sort values.
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
              {orderedServices.map((service, index) => {
                const isFirst = index === 0;
                const isLast =
                  index === orderedServices.length - 1;

                return (
                  <div
                    key={service.id}
                    className="flex items-center justify-between gap-4 border border-border bg-background px-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="font-primary text-xs uppercase tracking-[0.28em] text-foreground-muted">
                        {String(index + 1).padStart(2, "0")}
                      </p>
                      <p className="font-display text-xl uppercase tracking-[-0.04em] text-foreground">
                        {service.name}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          moveService(service.id, -1)
                        }
                        disabled={isFirst || isPending}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border px-3 font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          moveService(service.id, 1)
                        }
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
