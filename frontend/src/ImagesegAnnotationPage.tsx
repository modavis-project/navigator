import "./imagesegAnnotation.css";
import { ChevronLeft, ChevronRight, Crosshair, Eye, EyeOff, Image, Layers3, ListChecks, Maximize2, Move, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type PointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import {
  fetchImagesegAnnotationAudit,
  fetchImagesegAnnotationView,
  fetchImagesegLabelSuggestions,
  fetchImagesegSegmentAnnotations,
  fetchImagesegViewState,
  saveImagesegSegmentAnnotation,
  saveImagesegViewState,
  type ImagesegAnnotationAuditEntry,
  type ImagesegAnnotationTarget,
  type ImagesegAnnotationView,
  type ImagesegLabelSuggestion,
  type ImagesegSegment,
  type ImagesegSegmentAnnotation,
  type ImagesegViewState,
  type NavigatorActor,
} from "./api";
import { formatDateTime, formatInteger, friendlyLabel } from "./formatting";

const IMAGESEG_STACK_KEYS = "0123456789abcdefghijklmnopqrstuvwxyz".split("");
const IMAGESEG_STACK_COLORS = [
  { stroke: "#f7c948", fill: "rgba(247, 201, 72, 0.24)", swatch: "rgba(247, 201, 72, 0.72)" },
  { stroke: "#45b7d1", fill: "rgba(69, 183, 209, 0.22)", swatch: "rgba(69, 183, 209, 0.72)" },
  { stroke: "#ef476f", fill: "rgba(239, 71, 111, 0.2)", swatch: "rgba(239, 71, 111, 0.7)" },
  { stroke: "#78c679", fill: "rgba(120, 198, 121, 0.2)", swatch: "rgba(120, 198, 121, 0.72)" },
  { stroke: "#b388eb", fill: "rgba(179, 136, 235, 0.2)", swatch: "rgba(179, 136, 235, 0.72)" },
  { stroke: "#ff8a5b", fill: "rgba(255, 138, 91, 0.2)", swatch: "rgba(255, 138, 91, 0.7)" },
  { stroke: "#4ecdc4", fill: "rgba(78, 205, 196, 0.2)", swatch: "rgba(78, 205, 196, 0.72)" },
  { stroke: "#f78fb3", fill: "rgba(247, 143, 179, 0.2)", swatch: "rgba(247, 143, 179, 0.7)" },
  { stroke: "#a3e635", fill: "rgba(163, 230, 53, 0.18)", swatch: "rgba(163, 230, 53, 0.72)" },
  { stroke: "#93c5fd", fill: "rgba(147, 197, 253, 0.2)", swatch: "rgba(147, 197, 253, 0.72)" },
];
const IMAGESEG_MIN_ZOOM = 1;
const IMAGESEG_MAX_ZOOM = 6;
const IMAGESEG_ZOOM_STEP = 0.16;
const IMAGESEG_CLICK_TOLERANCE_CSS_PX = 9;
const IMAGESEG_STATUS_OPTIONS = ["draft", "reviewed", "accepted", "rejected", "needs_review", "needs_segmentation_fix"];
const IMAGESEG_DEFAULT_VIEW_STATE: Required<Pick<ImagesegViewState, "maskOpacity" | "outlineOnly" | "masksVisible" | "isolateSelected" | "dimNonSelected" | "segmentSort">> = {
  maskOpacity: 0.32,
  outlineOnly: false,
  masksVisible: true,
  isolateSelected: false,
  dimNonSelected: true,
  segmentSort: "unlabeled",
};

type ImagesegPreparedSegment = ImagesegSegment & {
  path: string;
  bbox: { x: number; y: number; width: number; height: number };
  annotation?: ImagesegSegmentAnnotation;
};

export default function ImagesegAnnotationPage({ actor, target }: { actor?: NavigatorActor; target: ImagesegAnnotationTarget }) {
  const [view, setView] = useState<ImagesegAnnotationView | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, ImagesegSegmentAnnotation>>({});
  const [labelSuggestionRows, setLabelSuggestionRows] = useState<ImagesegLabelSuggestion[]>([]);
  const [annotationAudit, setAnnotationAudit] = useState<ImagesegAnnotationAuditEntry[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoverStack, setHoverStack] = useState<ImagesegSegment[]>([]);
  const [hoverMessage, setHoverMessage] = useState<string | null>(null);
  const [stackCursor, setStackCursor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [renderedImageSize, setRenderedImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [maskOpacity, setMaskOpacity] = useState(IMAGESEG_DEFAULT_VIEW_STATE.maskOpacity);
  const [outlineOnly, setOutlineOnly] = useState(IMAGESEG_DEFAULT_VIEW_STATE.outlineOnly);
  const [masksVisible, setMasksVisible] = useState(IMAGESEG_DEFAULT_VIEW_STATE.masksVisible);
  const [isolateSelected, setIsolateSelected] = useState(IMAGESEG_DEFAULT_VIEW_STATE.isolateSelected);
  const [dimNonSelected, setDimNonSelected] = useState(IMAGESEG_DEFAULT_VIEW_STATE.dimNonSelected);
  const [segmentSort, setSegmentSort] = useState(IMAGESEG_DEFAULT_VIEW_STATE.segmentSort);
  const [label, setLabel] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const imageCanvasRef = useRef<HTMLDivElement | null>(null);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const panGestureRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const targetKey = JSON.stringify(target);
  const viewStateKey = imageSegmentViewStateKey(target);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setView(null);
    setAnnotations({});
    setLabelSuggestionRows([]);
    setAnnotationAudit([]);
    setSelectedSegmentId(null);
    setActiveSegmentId(null);
    setHoverMessage(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setMaskOpacity(IMAGESEG_DEFAULT_VIEW_STATE.maskOpacity);
    setOutlineOnly(IMAGESEG_DEFAULT_VIEW_STATE.outlineOnly);
    setMasksVisible(IMAGESEG_DEFAULT_VIEW_STATE.masksVisible);
    setIsolateSelected(IMAGESEG_DEFAULT_VIEW_STATE.isolateSelected);
    setDimNonSelected(IMAGESEG_DEFAULT_VIEW_STATE.dimNonSelected);
    setSegmentSort(IMAGESEG_DEFAULT_VIEW_STATE.segmentSort);
    fetchImagesegAnnotationView(target)
      .then(async (data) => {
        if (cancelled) return;
        setView(data);
        fetchImagesegViewState(viewStateKey)
          .then((record) => {
            if (cancelled) return;
            applyImageSegmentViewState(record.state || {});
          })
          .catch(() => undefined);
        fetchImagesegLabelSuggestions({
          ...target,
          runId: target.runId || data.run_id,
          mediaReferenceId: target.mediaReferenceId || data.image?.media_reference_id,
          imageIdentifier: target.imageIdentifier || data.image?.image_identifier,
          query: "",
          limit: 12,
        })
          .then((rows) => {
            if (!cancelled) setLabelSuggestionRows(rows);
          })
          .catch(() => {
            if (!cancelled) setLabelSuggestionRows([]);
          });
        const segmentIds = (data.segments || []).map((segment) => segment.segment_id).filter(Boolean);
        if (segmentIds.length) {
          const rows = await fetchImagesegSegmentAnnotations({
            ...target,
            runId: target.runId || data.run_id,
            mediaReferenceId: target.mediaReferenceId || data.image?.media_reference_id,
            imageIdentifier: target.imageIdentifier || data.image?.image_identifier,
            segmentIds,
          });
          if (!cancelled) setAnnotations(Object.fromEntries(rows.map((row) => [row.segmentId, row])));
        }
        if (!cancelled) {
          setSelectedSegmentId(null);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [targetKey]);

  const selectedAnnotation = selectedSegmentId ? annotations[selectedSegmentId] : undefined;
  useEffect(() => {
    setLabel(selectedAnnotation?.label || "");
    setComment(selectedAnnotation?.comment || "");
    setStatus(selectedAnnotation?.status || "draft");
    setSaveMessage(null);
  }, [selectedAnnotation?.annotationId, selectedSegmentId]);

  const segmentsById = useMemo(() => new Map((view?.segments || []).map((segment) => [segment.segment_id, segment])), [view]);
  const renderIds = view?.render_segment_ids?.length ? view.render_segment_ids : (view?.segments || []).map((segment) => segment.segment_id);
  const hitIds = view?.hit_test_segment_ids?.length ? view.hit_test_segment_ids : [...renderIds];
  const hoverStackIds = useMemo(() => new Set(hoverStack.map((segment) => segment.segment_id)), [hoverStack]);
  const hoverStackIndexById = useMemo(() => new Map(hoverStack.map((segment, index) => [segment.segment_id, index])), [hoverStack]);
  const selectedSegment = selectedSegmentId ? segmentsById.get(selectedSegmentId) : null;
  const activeSegment = activeSegmentId ? segmentsById.get(activeSegmentId) : selectedSegment;
  const imageWidth = Number(view?.image?.width || 0);
  const imageHeight = Number(view?.image?.height || 0);
  const imageSrc = view?.image?.display_url || "";
  const hasAnnotationText = label.trim().length > 0 || comment.trim().length > 0 || status !== (selectedAnnotation?.status || "draft");
  const zoomedImageWidth = Math.round(renderedImageSize.width * zoom);
  const zoomedImageHeight = Math.round(renderedImageSize.height * zoom);
  const imageScaleX = imageWidth > 0 && renderedImageSize.width > 0 ? (renderedImageSize.width * zoom) / imageWidth : 0;
  const imageScaleY = imageHeight > 0 && renderedImageSize.height > 0 ? (renderedImageSize.height * zoom) / imageHeight : 0;
  const preparedSegments = useMemo(
    () => imageSegmentPreparedSegments(view?.segments || [], annotations, imageWidth, imageHeight),
    [view, annotations, imageWidth, imageHeight]
  );
  const preparedSegmentsById = useMemo(() => new Map(preparedSegments.map((segment) => [segment.segment_id, segment])), [preparedSegments]);
  const sortedSegments = useMemo(() => imageSegmentSortedSegments(preparedSegments, segmentSort), [preparedSegments, segmentSort]);
  const selectedPreparedSegment = selectedSegmentId ? preparedSegmentsById.get(selectedSegmentId) : null;
  const selectedIndex = selectedSegmentId ? sortedSegments.findIndex((segment) => segment.segment_id === selectedSegmentId) : -1;
  const unlabeledCount = preparedSegments.filter((segment) => !segment.annotation?.label).length;
  const miniViewport = imageSegmentMiniViewport({ imageWidth, imageHeight, renderedImageSize, canvasSize, zoom, pan });
  const labelSuggestions = useMemo(
    () => imageSegmentSuggestionLabels(labelSuggestionRows, label),
    [labelSuggestionRows, label]
  );

  useEffect(() => {
    const node = imageFrameRef.current;
    if (!node) return;
    const observedNode = node;
    function updateSize() {
      const rect = observedNode.getBoundingClientRect();
      setRenderedImageSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(observedNode);
    return () => observer.disconnect();
  }, [imageWidth, imageHeight, imageSrc]);

  useEffect(() => {
    const node = imageCanvasRef.current;
    if (!node) return;
    const observedNode = node;
    function updateSize() {
      const rect = observedNode.getBoundingClientRect();
      setCanvasSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(observedNode);
    return () => observer.disconnect();
  }, [imageSrc]);

  useEffect(() => {
    if (!selectedSegmentId) {
      setAnnotationAudit([]);
      return;
    }
    let cancelled = false;
    fetchImagesegAnnotationAudit(selectedSegmentId)
      .then((rows) => {
        if (!cancelled) setAnnotationAudit(rows);
      })
      .catch(() => {
        if (!cancelled) setAnnotationAudit([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSegmentId]);

  useEffect(() => {
    if (!view) return;
    const handle = window.setTimeout(() => {
      saveImagesegViewState(
        {
          ...target,
          targetKey: viewStateKey,
          runId: target.runId || view.run_id,
          mediaReferenceId: target.mediaReferenceId || view.image?.media_reference_id,
          imageIdentifier: target.imageIdentifier || view.image?.image_identifier,
          state: {
            maskOpacity,
            outlineOnly,
            masksVisible,
            isolateSelected,
            dimNonSelected,
            segmentSort,
            zoom,
            pan,
            selectedSegmentId,
          },
        },
        actor
      ).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(handle);
  }, [actor, dimNonSelected, isolateSelected, maskOpacity, masksVisible, outlineOnly, pan, selectedSegmentId, segmentSort, targetKey, view, viewStateKey, zoom]);

  useEffect(() => {
    if (!view) return;
    const handle = window.setTimeout(() => {
      fetchImagesegLabelSuggestions({
        ...target,
        runId: target.runId || view.run_id,
        mediaReferenceId: target.mediaReferenceId || view.image?.media_reference_id,
        imageIdentifier: target.imageIdentifier || view.image?.image_identifier,
        query: label,
        limit: 12,
      })
        .then(setLabelSuggestionRows)
        .catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [label, targetKey, view]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const targetElement = event.target instanceof HTMLElement ? event.target : null;
      const tagName = targetElement?.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || targetElement?.isContentEditable) {
        if (tagName === "input" && targetElement === labelInputRef.current && (event.key === "Tab" || event.key === "Enter") && labelSuggestions.length) {
          event.preventDefault();
          applyLabelSuggestion(labelSuggestions[0]);
        }
        return;
      }
      const index = imageSegmentStackKeyIndex(event.key);
      if (index >= 0 && index < hoverStack.length) {
        event.preventDefault();
        const segment = hoverStack[index];
        setActiveSegmentId(segment.segment_id);
        setSelectedSegmentId(segment.segment_id);
        return;
      }
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        labelInputRef.current?.focus();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistAnnotation();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        selectNextUnlabeledSegment();
      } else if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        setMasksVisible((value) => !value);
      } else if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        setOutlineOnly((value) => !value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setSelectedSegmentId(null);
        setActiveSegmentId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hoverStack, labelSuggestions, selectedSegmentId, label, comment, status, sortedSegments]);

  async function saveAnnotation(event: FormEvent) {
    event.preventDefault();
    await persistAnnotation();
  }

  async function persistAnnotation() {
    if (!selectedSegmentId || !hasAnnotationText) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const saved = await saveImagesegSegmentAnnotation(
        {
          segmentId: selectedSegmentId,
          runId: target.runId || view?.run_id,
          mediaReferenceId: target.mediaReferenceId || view?.image?.media_reference_id,
          imageIdentifier: target.imageIdentifier || view?.image?.image_identifier,
          organId: target.organId,
          label,
          comment,
          status,
          metadata: {
            segment: {
              maskIndex: selectedSegment?.mask_index,
              areaPx: selectedSegment?.area_px,
              bboxXywh: selectedSegment?.bbox_xywh,
            },
            image: {
              width: imageWidth || null,
              height: imageHeight || null,
              contentSha256: view?.image?.content_sha256 || null,
              coordinateSpace: view?.coordinate_space || null,
            },
            displayTransform: {
              renderedWidth: zoomedImageWidth || null,
              renderedHeight: zoomedImageHeight || null,
              scaleX: imageScaleX || null,
              scaleY: imageScaleY || null,
              zoom,
              panX: Math.round(pan.x),
              panY: Math.round(pan.y),
            },
          },
        },
        actor
      );
      setAnnotations((current) => ({ ...current, [saved.segmentId]: saved }));
      setSaveMessage("Annotation saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save annotation");
    } finally {
      setSaving(false);
    }
  }

  function applyImageSegmentViewState(state: ImagesegViewState) {
    setMaskOpacity(clampNumber(Number(state.maskOpacity ?? IMAGESEG_DEFAULT_VIEW_STATE.maskOpacity), 0.05, 0.75));
    setOutlineOnly(Boolean(state.outlineOnly ?? IMAGESEG_DEFAULT_VIEW_STATE.outlineOnly));
    setMasksVisible(Boolean(state.masksVisible ?? IMAGESEG_DEFAULT_VIEW_STATE.masksVisible));
    setIsolateSelected(Boolean(state.isolateSelected ?? IMAGESEG_DEFAULT_VIEW_STATE.isolateSelected));
    setDimNonSelected(Boolean(state.dimNonSelected ?? IMAGESEG_DEFAULT_VIEW_STATE.dimNonSelected));
    setSegmentSort(typeof state.segmentSort === "string" ? state.segmentSort : IMAGESEG_DEFAULT_VIEW_STATE.segmentSort);
    if (typeof state.zoom === "number") setZoom(clampNumber(state.zoom, IMAGESEG_MIN_ZOOM, IMAGESEG_MAX_ZOOM));
    if (state.pan && typeof state.pan.x === "number" && typeof state.pan.y === "number") setPan({ x: state.pan.x, y: state.pan.y });
    if (state.selectedSegmentId) setSelectedSegmentId(state.selectedSegmentId);
  }

  function selectNextUnlabeledSegment() {
    const startIndex = Math.max(0, selectedIndex + 1);
    const next = [...sortedSegments.slice(startIndex), ...sortedSegments.slice(0, startIndex)].find((segment) => !segment.annotation?.label);
    if (next) selectSegment(next.segment_id);
  }

  function selectRelativeSegment(offset: number) {
    if (!sortedSegments.length) return;
    const current = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = (current + offset + sortedSegments.length) % sortedSegments.length;
    selectSegment(sortedSegments[nextIndex].segment_id);
  }

  function updateHoverStack(event: PointerEvent<HTMLElement | SVGSVGElement> | MouseEvent<HTMLElement | SVGSVGElement>) {
    const result = imageSegmentStackFromEvent(event);
    if (!result) return;
    setHoverStack(result.stack);
    setActiveSegmentId(result.stack[0]?.segment_id || null);
    setStackCursor(result.cursor);
  }

  function clearHoverStack() {
    setHoverStack([]);
    setStackCursor(null);
    setActiveSegmentId(null);
    setHoverMessage(null);
  }

  function selectSegment(segmentId: string) {
    setSelectedSegmentId(segmentId);
    setActiveSegmentId(segmentId);
  }

  function selectSegmentFromPoint(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) {
    const result = imageSegmentStackFromEvent(event);
    const segment = result?.stack[0];
    if (!segment) return;
    setHoverStack(result.stack);
    setStackCursor(result.cursor);
    selectSegment(segment.segment_id);
  }

  function startImagePan(event: PointerEvent<HTMLElement>) {
    if (zoom <= 1) return;
    panGestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function updateImagePan(event: PointerEvent<HTMLElement>) {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      updateHoverStack(event);
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
    setPan({ x: gesture.panX + dx, y: gesture.panY + dy });
    updateHoverStack(event);
  }

  function endImagePan(event: PointerEvent<HTMLElement>) {
    const gesture = panGestureRef.current;
    panGestureRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!gesture || !gesture.moved) {
      selectSegmentFromPoint(event);
    }
  }

  function startImageMousePan(event: MouseEvent<HTMLElement>) {
    if (zoom <= 1 || panGestureRef.current) return;
    panGestureRef.current = { pointerId: -1, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, moved: false };
  }

  function updateImageMousePan(event: MouseEvent<HTMLElement>) {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== -1 || event.buttons !== 1) {
      updateHoverStack(event);
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
    setPan({ x: gesture.panX + dx, y: gesture.panY + dy });
    updateHoverStack(event);
  }

  function endImageMousePan(event: MouseEvent<HTMLElement>) {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== -1) return;
    panGestureRef.current = null;
    if (!gesture.moved) {
      selectSegmentFromPoint(event);
    }
  }

  function handleZoomWheel(event: ReactWheelEvent<HTMLElement>) {
    if (!imageSrc || imageWidth <= 0 || imageHeight <= 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const direction = event.deltaY < 0 ? 1 : -1;
    applyImageZoom(zoom + direction * IMAGESEG_ZOOM_STEP * Math.max(1, zoom), origin);
  }

  function applyImageZoom(nextZoom: number, origin?: { x: number; y: number }) {
    const clampedZoom = clampNumber(nextZoom, IMAGESEG_MIN_ZOOM, IMAGESEG_MAX_ZOOM);
    const previousZoom = zoom;
    if (clampedZoom === previousZoom) return;
    if (clampedZoom === IMAGESEG_MIN_ZOOM) {
      setZoom(clampedZoom);
      setPan({ x: 0, y: 0 });
      return;
    }
    setZoom(clampedZoom);
    if (!origin) return;
    const ratio = clampedZoom / previousZoom;
    setPan((current) => ({
      x: origin.x - (origin.x - current.x) * ratio,
      y: origin.y - (origin.y - current.y) * ratio,
    }));
  }

  function resetImageZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function fitImageToStage() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function zoomToNativeSize() {
    const nextZoom = imageScaleX > 0 ? clampNumber(1 / imageScaleX, IMAGESEG_MIN_ZOOM, IMAGESEG_MAX_ZOOM) : 1;
    setZoom(nextZoom);
    setPan({ x: 0, y: 0 });
  }

  function zoomToSelectedSegment() {
    if (!selectedPreparedSegment || !renderedImageSize.width || !renderedImageSize.height) return;
    const bbox = selectedPreparedSegment.bbox;
    const margin = 1.8;
    const zoomX = bbox.width > 0 ? imageWidth / (bbox.width * margin) : IMAGESEG_MAX_ZOOM;
    const zoomY = bbox.height > 0 ? imageHeight / (bbox.height * margin) : IMAGESEG_MAX_ZOOM;
    const nextZoom = clampNumber(Math.min(zoomX, zoomY), IMAGESEG_MIN_ZOOM, IMAGESEG_MAX_ZOOM);
    const centerX = ((bbox.x + bbox.width / 2) / imageWidth) * renderedImageSize.width;
    const centerY = ((bbox.y + bbox.height / 2) / imageHeight) * renderedImageSize.height;
    setZoom(nextZoom);
    setPan({
      x: canvasSize.width / 2 - centerX * nextZoom,
      y: canvasSize.height / 2 - centerY * nextZoom,
    });
  }

  function applyLabelSuggestion(term: string) {
    setLabel(term);
    requestAnimationFrame(() => labelInputRef.current?.focus());
  }

  function imageSegmentStackFromEvent(event: PointerEvent<HTMLElement | SVGSVGElement> | MouseEvent<HTMLElement | SVGSVGElement>) {
    if (!view || imageWidth <= 0 || imageHeight <= 0) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clampNumber(((event.clientX - rect.left) / rect.width) * imageWidth, 0, imageWidth);
    const y = clampNumber(((event.clientY - rect.top) / rect.height) * imageHeight, 0, imageHeight);
    const hitSet = new Set(hitIds);
    const tolerance = Math.max(1, IMAGESEG_CLICK_TOLERANCE_CSS_PX / Math.max(imageScaleX, imageScaleY, 0.1));
    let stack = preparedSegments
      .filter((segment) => hitSet.has(segment.segment_id) && imageSegmentPointInExpandedBbox(segment.bbox, x, y, 0) && imagesegSegmentContainsPoint(segment, x, y, imageWidth, imageHeight))
      .sort((left, right) => Number(left.area_px || Number.MAX_SAFE_INTEGER) - Number(right.area_px || Number.MAX_SAFE_INTEGER));
    const nearest = imageSegmentNearestSegment(preparedSegments.filter((segment) => hitSet.has(segment.segment_id)), x, y);
    if (!stack.length) {
      stack = preparedSegments
        .filter((segment) => {
          const area = Number(segment.area_px || 0);
          return hitSet.has(segment.segment_id) && area < 16000 && imageSegmentPointInExpandedBbox(segment.bbox, x, y, tolerance);
        })
        .sort((left, right) => imageSegmentBboxDistance(left.bbox, x, y) - imageSegmentBboxDistance(right.bbox, x, y))
        .slice(0, 1);
    }
    if (stack.length) {
      setHoverMessage(stack.length === 1 ? "1 segment" : `${stack.length} segments`);
    } else if (nearest && nearest.distance <= tolerance * 3) {
      setHoverMessage(`nearest ${Math.round(nearest.distance)} px`);
    } else {
      setHoverMessage("no segment");
    }
    return {
      stack,
      cursor: { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height },
    };
  }

  return (
    <article className="imageseg-annotation-page">
      <div className="evidence-dossier-head">
        <div>
          <p className="eyebrow">Image segmentation</p>
          <h2>Organ image annotations</h2>
          <p>{view ? `${view.segment_count ?? view.segments.length} segment${(view.segment_count ?? view.segments.length) === 1 ? "" : "s"} loaded` : "Loading segment overlay"}</p>
        </div>
        <div className="imageseg-target-summary">
          <span>{target.organId || view?.image?.source_record_id || "Organ media"}</span>
          <strong>{target.mediaReferenceId || view?.image?.media_reference_id || target.runId || view?.run_id || "annotation target"}</strong>
        </div>
      </div>
      {loading && <p className="notice">Loading image segments...</p>}
      {error && <p className="notice error">{error}</p>}
      {view && (
        <div className="imageseg-annotation-layout">
          <section className="imageseg-stage-panel" aria-label="Segmented organ image">
	            <div className="imageseg-canvas" ref={imageCanvasRef} onWheel={handleZoomWheel}>
	              {imageSrc && imageWidth > 0 && imageHeight > 0 ? (
	                <div
                    className="imageseg-image-frame"
                    ref={imageFrameRef}
                    style={imageSegmentFrameStyle(imageWidth, imageHeight, zoom, pan)}
                  >
	                  <img src={imageSrc} alt="" />
	                  <svg
                      className={`imageseg-overlay ${!masksVisible ? "masks-hidden" : ""} ${outlineOnly ? "outline-only" : ""} ${isolateSelected ? "isolate-selected" : ""} ${dimNonSelected ? "dim-non-selected" : ""}`}
                      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
                      aria-label="Image segment overlay"
                      role="img"
                      style={{ "--imageseg-mask-opacity": String(maskOpacity) } as CSSProperties}
                    >
	                    <rect className="imageseg-pointer-plane" x="0" y="0" width={imageWidth} height={imageHeight} />
	                    <g className="imageseg-render-layer">
	                      {renderIds.map((segmentId) => {
	                        const segment = preparedSegmentsById.get(segmentId);
	                        const path = segment?.path || "";
	                        if (!segment || !path) return null;
	                        const hasAnnotation = Boolean(annotations[segment.segment_id]);
	                        const isSelected = selectedSegmentId === segment.segment_id;
	                        const isActive = activeSegmentId === segment.segment_id;
	                        const isStacked = hoverStackIds.has(segment.segment_id);
	                        const stackIndex = hoverStackIndexById.get(segment.segment_id);
	                        return (
	                          <path
	                            key={`render:${segment.segment_id}`}
	                            className={`imageseg-segment-path ${hasAnnotation ? "annotated" : ""} ${isStacked ? "stacked" : ""} ${isSelected ? "selected" : ""} ${isActive ? "active" : ""}`}
	                            data-segment-id={segment.segment_id}
	                            data-stack-key={stackIndex != null ? IMAGESEG_STACK_KEYS[stackIndex] : undefined}
	                            style={stackIndex != null ? imageSegmentStackStyle(stackIndex) : undefined}
	                            d={path}
	                            fillRule="evenodd"
	                          />
	                        );
	                      })}
	                    </g>
	                    <g className="imageseg-hit-layer">
	                      {hitIds.map((segmentId) => {
	                        const segment = preparedSegmentsById.get(segmentId);
	                        const path = segment?.path || "";
	                        if (!segment || !path) return null;
	                        return (
	                          <path
	                            key={`hit:${segment.segment_id}`}
	                            className="imageseg-segment-hit"
	                            data-segment-id={segment.segment_id}
	                            d={path}
	                            fillRule="evenodd"
	                          />
	                        );
	                      })}
	                    </g>
	                  </svg>
	                  <div
	                    className="imageseg-interaction-plane"
                      onPointerDown={startImagePan}
	                    onPointerMove={updateImagePan}
                      onPointerUp={endImagePan}
                      onPointerCancel={endImagePan}
                      onMouseDown={startImageMousePan}
	                    onMouseMove={updateImageMousePan}
                      onMouseUp={endImageMousePan}
	                    onPointerLeave={clearHoverStack}
	                    onMouseLeave={clearHoverStack}
	                  />
	                  {stackCursor && (hoverStack.length > 0 || hoverMessage) && (
	                    <div
	                      className="imageseg-cursor-legend"
	                      style={{
	                        left: `${clampNumber(stackCursor.x + 14, 8, Math.max(8, stackCursor.width - 220))}px`,
	                        top: `${clampNumber(stackCursor.y + 14, 8, Math.max(8, stackCursor.height - 120))}px`,
                          transform: `scale(${1 / zoom})`,
	                      }}
	                    >
                        {hoverMessage && hoverStack.length === 0 && <div className="imageseg-cursor-legend-note">{hoverMessage}</div>}
	                      {hoverStack.slice(0, IMAGESEG_STACK_KEYS.length).map((segment, index) => (
	                        <div
	                          key={segment.segment_id}
	                          className={`imageseg-cursor-legend-row ${segment.segment_id === selectedSegmentId ? "selected" : ""}`}
	                          data-segment-id={segment.segment_id}
	                          data-stack-key={IMAGESEG_STACK_KEYS[index]}
	                          style={imageSegmentStackStyle(index)}
	                        >
	                          <kbd>{IMAGESEG_STACK_KEYS[index]}</kbd>
	                          <span>{segment.area_px ? `${formatInteger(segment.area_px)} px` : "area unknown"}</span>
	                        </div>
	                      ))}
	                    </div>
	                  )}
	                </div>
	              ) : (
                <div className="media-reference-preview">
                  <Image size={28} />
                  <span>No browser-loadable image is available for this segment payload</span>
                </div>
	              )}
                {imageSrc && imageWidth > 0 && imageHeight > 0 && (
                  <div className="imageseg-zoom-controls" aria-label="Image zoom controls">
                    <button type="button" onClick={() => applyImageZoom(zoom - IMAGESEG_ZOOM_STEP * Math.max(1, zoom))} disabled={zoom <= IMAGESEG_MIN_ZOOM} aria-label="Zoom out" title="Zoom out">
                      <ZoomOut size={16} />
                    </button>
                    <span>{Math.round(zoom * 100)}%</span>
                    <button type="button" onClick={() => applyImageZoom(zoom + IMAGESEG_ZOOM_STEP * Math.max(1, zoom))} disabled={zoom >= IMAGESEG_MAX_ZOOM} aria-label="Zoom in" title="Zoom in">
                      <ZoomIn size={16} />
                    </button>
                    <button type="button" onClick={fitImageToStage} aria-label="Fit image" title="Fit image">
                      <Maximize2 size={16} />
                    </button>
                    <button type="button" onClick={zoomToNativeSize} aria-label="Show image at 100%" title="100%">
                      <Crosshair size={16} />
                    </button>
                    <button type="button" onClick={zoomToSelectedSegment} disabled={!selectedPreparedSegment} aria-label="Zoom to selected segment" title="Zoom to selected">
                      <Move size={16} />
                    </button>
                    <button type="button" onClick={resetImageZoom} disabled={zoom === 1 && pan.x === 0 && pan.y === 0} aria-label="Reset zoom" title="Reset zoom">
                      <RotateCcw size={16} />
                    </button>
                  </div>
                )}
                {imageSrc && imageWidth > 0 && imageHeight > 0 && (
                  <div className="imageseg-mask-controls" aria-label="Mask display controls">
                    <button type="button" onClick={() => setMasksVisible((value) => !value)} aria-label={masksVisible ? "Hide masks" : "Show masks"} title={masksVisible ? "Hide masks" : "Show masks"}>
                      {masksVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button type="button" className={outlineOnly ? "active" : ""} onClick={() => setOutlineOnly((value) => !value)} aria-label="Outline only" title="Outline only">
                      <Layers3 size={16} />
                    </button>
                    <button type="button" className={isolateSelected ? "active" : ""} onClick={() => setIsolateSelected((value) => !value)} disabled={!selectedSegmentId} aria-label="Isolate selected segment" title="Isolate selected">
                      <ListChecks size={16} />
                    </button>
                    <label>
                      <span>{Math.round(maskOpacity * 100)}%</span>
                      <input type="range" min="0.05" max="0.75" step="0.05" value={maskOpacity} onChange={(event) => setMaskOpacity(Number(event.target.value))} aria-label="Mask opacity" />
                    </label>
                  </div>
                )}
                {imageSrc && imageWidth > 0 && imageHeight > 0 && (
                  <div className="imageseg-minimap" aria-label="Image viewport overview">
                    <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`}>
                      <rect x="0" y="0" width={imageWidth} height={imageHeight} />
                      {selectedPreparedSegment && <path d={selectedPreparedSegment.path} />}
                      {miniViewport && <rect className="viewport" x={miniViewport.x} y={miniViewport.y} width={miniViewport.width} height={miniViewport.height} />}
                    </svg>
                  </div>
                )}
	            </div>
	            {imageWidth > 0 && imageHeight > 0 && (
	              <div className="imageseg-dimension-strip">
	                <span>Original {formatInteger(imageWidth)} x {formatInteger(imageHeight)} px</span>
	                <span>Display {formatInteger(zoomedImageWidth || imageWidth)} x {formatInteger(zoomedImageHeight || imageHeight)} px</span>
	                {imageScaleX > 0 && imageScaleY > 0 && <span>Scale {imageScaleX.toFixed(2)} x {imageScaleY.toFixed(2)}</span>}
	              </div>
	            )}
	          </section>
          <aside className="imageseg-side-panel">
            <div className="imageseg-segment-summary">
              <span>{activeSegment?.segment_id || "No segment selected"}</span>
              <strong>{activeSegment?.area_px ? `${formatInteger(activeSegment.area_px)} px` : "area unknown"}</strong>
              <small>{activeSegment?.class_label || "Unlabeled generated segment"}</small>
            </div>
            <div className="imageseg-workflow-controls">
              <button type="button" onClick={() => selectRelativeSegment(-1)} disabled={!sortedSegments.length} aria-label="Previous segment">
                <ChevronLeft size={16} />
              </button>
              <button type="button" onClick={selectNextUnlabeledSegment} disabled={unlabeledCount === 0}>
                <ListChecks size={16} />
                <span>{unlabeledCount}</span>
              </button>
              <button type="button" onClick={() => selectRelativeSegment(1)} disabled={!sortedSegments.length} aria-label="Next segment">
                <ChevronRight size={16} />
              </button>
              <select value={segmentSort} onChange={(event) => setSegmentSort(event.target.value)} aria-label="Segment sort">
                <option value="unlabeled">Unlabeled first</option>
                <option value="smallest">Smallest first</option>
                <option value="largest">Largest first</option>
                <option value="mask">Mask order</option>
                <option value="selected">Selected first</option>
              </select>
            </div>
            <form className="imageseg-annotation-form" onSubmit={saveAnnotation}>
              <label>
                <span>Segment ID</span>
                <input value={selectedSegmentId || ""} readOnly />
              </label>
              <label>
                <span>Label</span>
                <input ref={labelInputRef} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Console, pipework, casework" disabled={!selectedSegmentId} />
              </label>
              {selectedSegmentId && labelSuggestions.length > 0 && (
                <div className="imageseg-label-suggestions" aria-label="Previously used labels">
                  {labelSuggestions.map((term) => (
                    <button type="button" key={term} onClick={() => applyLabelSuggestion(term)}>
                      {term}
                    </button>
                  ))}
                </div>
              )}
              <label>
                <span>Comment</span>
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add interpretation or review notes for this segment" disabled={!selectedSegmentId} />
              </label>
              <label>
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)} disabled={!selectedSegmentId}>
                  {IMAGESEG_STATUS_OPTIONS.map((option) => (
                    <option value={option} key={option}>{friendlyLabel(option)}</option>
                  ))}
                </select>
              </label>
	              <button type="submit" disabled={!selectedSegmentId || !hasAnnotationText || saving}>
	                {saving ? "Saving..." : "Save annotation"}
	              </button>
              {saveMessage && <p className="notice success">{saveMessage}</p>}
            </form>
            <div className="imageseg-segment-list">
              {sortedSegments.slice(0, 64).map((segment) => (
                <button
                  type="button"
                  key={segment.segment_id}
                  className={segment.segment_id === selectedSegmentId ? "selected" : ""}
                  onClick={() => selectSegment(segment.segment_id)}
                >
                  <svg viewBox={`${segment.bbox.x} ${segment.bbox.y} ${Math.max(1, segment.bbox.width)} ${Math.max(1, segment.bbox.height)}`} aria-hidden="true">
                    <path d={segment.path} />
                  </svg>
                  <span>
                    <strong>{segment.annotation?.label || `#${segment.mask_index ?? "?"}`}</strong>
                    <small>{segment.area_px ? `${formatInteger(segment.area_px)} px` : "area unknown"}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="imageseg-annotation-list">
              <h3>Saved annotations</h3>
              {Object.values(annotations).length === 0 && <p className="muted">No segment annotations saved yet.</p>}
              {Object.values(annotations).map((annotation) => (
                <button type="button" key={annotation.segmentId} onClick={() => setSelectedSegmentId(annotation.segmentId)}>
                  <strong>{annotation.label || annotation.segmentId}</strong>
                  <span>{annotation.comment || friendlyLabel(annotation.status || "draft")}</span>
                </button>
              ))}
            </div>
            {selectedSegmentId && (
              <div className="imageseg-audit-list">
                <h3>History</h3>
                {annotationAudit.length === 0 && <p className="muted">No saved history yet.</p>}
                {annotationAudit.slice(0, 5).map((entry) => (
                  <div key={entry.auditId || `${entry.segmentId}:${entry.createdAt}`}>
                    <strong>{friendlyLabel(entry.action || "update")}</strong>
                    <span>{entry.actorId || "unknown actor"} {entry.createdAt ? `· ${formatDateTime(entry.createdAt)}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </article>
  );
}

function imageSegmentViewStateKey(target: ImagesegAnnotationTarget): string {
  return [
    target.runId ? `run:${target.runId}` : "",
    target.mediaReferenceId ? `media:${target.mediaReferenceId}` : "",
    target.imageIdentifier ? `image:${target.imageIdentifier}` : "",
    target.organId ? `organ:${target.organId}` : "",
  ].filter(Boolean).join("|") || "imageseg:annotation";
}

function imageSegmentPreparedSegments(
  segments: ImagesegSegment[],
  annotations: Record<string, ImagesegSegmentAnnotation>,
  width: number,
  height: number
): ImagesegPreparedSegment[] {
  return segments.map((segment) => ({
    ...segment,
    path: imagesegPathFromPolygons(segment.polygon_norm, width, height),
    bbox: imageSegmentBbox(segment, width, height),
    annotation: annotations[segment.segment_id],
  }));
}

function imageSegmentSortedSegments(segments: ImagesegPreparedSegment[], sortMode: string): ImagesegPreparedSegment[] {
  return [...segments].sort((left, right) => {
    if (sortMode === "selected") {
      const leftAnnotated = left.annotation ? 1 : 0;
      const rightAnnotated = right.annotation ? 1 : 0;
      if (leftAnnotated !== rightAnnotated) return leftAnnotated - rightAnnotated;
    }
    if (sortMode === "unlabeled") {
      const leftLabel = left.annotation?.label ? 1 : 0;
      const rightLabel = right.annotation?.label ? 1 : 0;
      if (leftLabel !== rightLabel) return leftLabel - rightLabel;
    }
    if (sortMode === "smallest") return Number(left.area_px || 0) - Number(right.area_px || 0);
    if (sortMode === "largest") return Number(right.area_px || 0) - Number(left.area_px || 0);
    return Number(left.mask_index || 0) - Number(right.mask_index || 0);
  });
}

function imagesegPathFromPolygons(polygons: unknown, width: number, height: number): string {
  if (!Array.isArray(polygons) || width <= 0 || height <= 0) return "";
  const commands: string[] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) continue;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      ring.forEach((point, index) => {
        if (!Array.isArray(point) || point.length < 2) return;
        const x = clampNumber(Number(point[0]) * width, 0, width);
        const y = clampNumber(Number(point[1]) * height, 0, height);
        commands.push(`${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
      });
      commands.push("Z");
    }
  }
  return commands.join(" ");
}

function imageSegmentBbox(segment: ImagesegSegment, width: number, height: number): { x: number; y: number; width: number; height: number } {
  const bbox = segment.bbox_xywh;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    return { x: Number(bbox[0]) || 0, y: Number(bbox[1]) || 0, width: Number(bbox[2]) || 1, height: Number(bbox[3]) || 1 };
  }
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  if (Array.isArray(segment.polygon_norm)) {
    for (const polygon of segment.polygon_norm) {
      if (!Array.isArray(polygon)) continue;
      for (const ring of polygon) {
        if (!Array.isArray(ring)) continue;
        for (const point of ring) {
          if (!Array.isArray(point) || point.length < 2) continue;
          const x = clampNumber(Number(point[0]) * width, 0, width);
          const y = clampNumber(Number(point[1]) * height, 0, height);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
  }
  if (minX > maxX || minY > maxY) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function imageSegmentPointInExpandedBbox(bbox: { x: number; y: number; width: number; height: number }, x: number, y: number, tolerance: number): boolean {
  return x >= bbox.x - tolerance && x <= bbox.x + bbox.width + tolerance && y >= bbox.y - tolerance && y <= bbox.y + bbox.height + tolerance;
}

function imageSegmentBboxDistance(bbox: { x: number; y: number; width: number; height: number }, x: number, y: number): number {
  const dx = Math.max(bbox.x - x, 0, x - (bbox.x + bbox.width));
  const dy = Math.max(bbox.y - y, 0, y - (bbox.y + bbox.height));
  return Math.hypot(dx, dy);
}

function imageSegmentNearestSegment(segments: ImagesegPreparedSegment[], x: number, y: number): { segment: ImagesegPreparedSegment; distance: number } | null {
  let nearest: { segment: ImagesegPreparedSegment; distance: number } | null = null;
  for (const segment of segments) {
    const distance = imageSegmentBboxDistance(segment.bbox, x, y);
    if (!nearest || distance < nearest.distance) nearest = { segment, distance };
  }
  return nearest;
}

function imagesegSegmentContainsPoint(segment: ImagesegSegment, x: number, y: number, width: number, height: number): boolean {
  if (!Array.isArray(segment.polygon_norm) || width <= 0 || height <= 0) return false;
  let contains = false;
  for (const polygon of segment.polygon_norm) {
    if (!Array.isArray(polygon)) continue;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      if (imagesegRingContainsPoint(ring, x, y, width, height)) contains = !contains;
    }
  }
  return contains;
}

function imagesegRingContainsPoint(ring: unknown[], x: number, y: number, width: number, height: number): boolean {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const point = ring[index];
    const previousPoint = ring[previousIndex];
    if (!Array.isArray(point) || !Array.isArray(previousPoint) || point.length < 2 || previousPoint.length < 2) continue;
    const px = clampNumber(Number(point[0]) * width, 0, width);
    const py = clampNumber(Number(point[1]) * height, 0, height);
    const qx = clampNumber(Number(previousPoint[0]) * width, 0, width);
    const qy = clampNumber(Number(previousPoint[1]) * height, 0, height);
    if ((py > y) !== (qy > y) && x < ((qx - px) * (y - py)) / (qy - py || 1) + px) {
      inside = !inside;
    }
  }
  return inside;
}

function imageSegmentStackKeyIndex(key: string): number {
  return IMAGESEG_STACK_KEYS.indexOf(key.toLowerCase());
}

function imageSegmentStackStyle(index: number): CSSProperties {
  const color = IMAGESEG_STACK_COLORS[index % IMAGESEG_STACK_COLORS.length];
  return {
    "--imageseg-stack-fill": color.fill,
    "--imageseg-stack-stroke": color.stroke,
    "--imageseg-stack-swatch": color.swatch,
  } as CSSProperties;
}

function imageSegmentSuggestionLabels(suggestions: ImagesegLabelSuggestion[], currentLabel: string): string[] {
  const current = currentLabel.trim().toLowerCase();
  return suggestions
    .map((item) => item.label?.trim())
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .filter((item) => !current || (item.toLowerCase() !== current && item.toLowerCase().includes(current)))
    .slice(0, 10);
}

function imageSegmentLabelSuggestions(annotations: ImagesegSegmentAnnotation[], currentLabel: string): string[] {
  const current = currentLabel.trim().toLowerCase();
  const terms = new Map<string, { label: string; count: number; latest: string }>();
  for (const annotation of annotations) {
    for (const term of imageSegmentLabelTerms(annotation.label)) {
      const key = term.toLowerCase();
      if (!key || key === current) continue;
      if (current && !key.includes(current)) continue;
      const existing = terms.get(key);
      const updatedAt = annotation.updatedAt || annotation.createdAt || "";
      if (existing) {
        existing.count += 1;
        if (updatedAt > existing.latest) existing.latest = updatedAt;
      } else {
        terms.set(key, { label: term, count: 1, latest: updatedAt });
      }
    }
  }
  return Array.from(terms.values())
    .sort((left, right) => right.count - left.count || right.latest.localeCompare(left.latest) || left.label.localeCompare(right.label))
    .slice(0, 10)
    .map((item) => item.label);
}

function imageSegmentLabelTerms(label?: string | null): string[] {
  return (label || "")
    .split(/[;,|\n]/)
    .map((term) => term.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function imageSegmentFrameStyle(width: number, height: number, zoom = 1, pan: { x: number; y: number } = { x: 0, y: 0 }): CSSProperties {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  return {
    aspectRatio: `${width} / ${height}`,
    "--imageseg-frame-max-width": `min(100%, calc(min(72vh, 760px) * ${ratio}))`,
    transform: `translate(${pan.x.toFixed(1)}px, ${pan.y.toFixed(1)}px) scale(${zoom.toFixed(3)})`,
  } as CSSProperties;
}

function imageSegmentMiniViewport({
  imageWidth,
  imageHeight,
  renderedImageSize,
  canvasSize,
  zoom,
  pan,
}: {
  imageWidth: number;
  imageHeight: number;
  renderedImageSize: { width: number; height: number };
  canvasSize: { width: number; height: number };
  zoom: number;
  pan: { x: number; y: number };
}): { x: number; y: number; width: number; height: number } | null {
  if (!imageWidth || !imageHeight || !renderedImageSize.width || !renderedImageSize.height || !canvasSize.width || !canvasSize.height || !zoom) return null;
  const scaleX = imageWidth / (renderedImageSize.width * zoom);
  const scaleY = imageHeight / (renderedImageSize.height * zoom);
  const x = clampNumber(-pan.x * scaleX, 0, imageWidth);
  const y = clampNumber(-pan.y * scaleY, 0, imageHeight);
  const width = clampNumber(canvasSize.width * scaleX, 1, imageWidth);
  const height = clampNumber(canvasSize.height * scaleY, 1, imageHeight);
  return { x, y, width, height };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
