import React, { useRef, useState, useEffect } from 'react';

export interface GraphSvgContainerProps {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  className?: string;
  style?: React.CSSProperties;
  children: (props: {
    width: number;
    height: number;
    viewBoxWidth: number;
    viewBoxHeight: number;
    svgRef: React.RefObject<SVGSVGElement | null>;
  }) => React.ReactNode;
}

export const GraphSvgContainer: React.FC<GraphSvgContainerProps> = ({
  viewBoxWidth = 700,
  viewBoxHeight = 320,
  className = '',
  style,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: viewBoxWidth, height: viewBoxHeight });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          // Keep aspect ratio
          const height = Math.round((width / viewBoxWidth) * viewBoxHeight);
          setDimensions({ width: Math.round(width), height: Math.max(180, height) });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [viewBoxWidth, viewBoxHeight]);

  return (
    <div
      ref={containerRef}
      className={`w-full relative overflow-hidden select-none ${className}`}
      style={style}
    >
      {children({
        width: dimensions.width,
        height: dimensions.height,
        viewBoxWidth,
        viewBoxHeight,
        svgRef,
      })}
    </div>
  );
};
