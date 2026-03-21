/**
 * EmailLayout — shared branded wrapper for all SMOG email templates.
 *
 * Renders a consistent header (SMOG logo on brand-green background) and a
 * branded footer bar so every email feels like it comes from the same place.
 */
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Section,
  Text,
} from "@react-email/components";
import type * as React from "react";
import * as S from "./styles";

interface EmailLayoutProps {
  preview: React.ReactNode;
  children: React.ReactNode;
  /** Base URL for logo/links — defaults to https://app.smog.vlaanderen */
  baseUrl?: string;
}

export function EmailLayout({
  preview,
  children,
  baseUrl = "https://app.smog.vlaanderen",
}: EmailLayoutProps) {
  const logoUrl = `${baseUrl}/assets/logo.svg`;

  return (
    <Html lang="nl">
      <Head />
      {/* The Preview component must be a direct child of Html/Head per react-email */}
      {preview}
      <Body style={S.body}>
        <Container style={S.container}>
          {/* ── Branded header ── */}
          <Section style={S.header}>
            <Img alt="SMOG" height={40} src={logoUrl} style={S.logoImg} />
          </Section>

          {/* ── Email content (injected by each template) ── */}
          <Section style={S.content}>{children}</Section>

          {/* ── Branded footer bar ── */}
          <Section style={S.footerBar}>
            <Text style={S.footerBarText}>
              © {new Date().getFullYear()} SMOG & CO vzw · België
            </Text>
            <Text style={{ ...S.footerBarText, marginTop: "4px" }}>
              SMOG — Spreken Met Ondersteuning van Gebaren
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default EmailLayout;
