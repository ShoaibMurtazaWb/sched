"use client";

import React from "react";
import { SidePanel, type SidePanelProps } from "./side-panel";

export type SlideOverProps = SidePanelProps & {
  maxWidth?: string;
};

export function SlideOver({ maxWidth, width, ...props }: SlideOverProps) {
  return <SidePanel width={width || maxWidth} {...props} />;
}
