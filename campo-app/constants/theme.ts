import { StyleSheet } from 'react-native';

// ── Paleta ────────────────────────────────────────────────────────────────────

export const C = {
  primary:      '#1A4870',
  primaryDark:  '#0B2D50',
  primaryLight: '#EBF2F9',
  accent:       '#C9921B',
  accentLight:  '#FBF3E0',
  bg:           '#F2F4F8',
  surface:      '#FFFFFF',
  border:       '#E0E5EF',
  borderLight:  '#EFF2F8',
  text:         '#111827',
  textSub:      '#4B5563',
  textTert:     '#6B7280',
  textWeak:     '#9CA3AF',
  red:          '#DC2626',
  redBg:        '#FEF2F2',
  orange:       '#D97706',
  orangeBg:     '#FFFBEB',
  green:        '#16A34A',
  greenBg:      '#F0FDF4',
  blue:         '#2563EB',
} as const;

// ── Tipografia e componentes compartilhados ────────────────────────────────────

export const T = StyleSheet.create({
  // Tipografia
  h1:      { fontSize: 22, fontWeight: '700', color: C.text,    letterSpacing: -0.5, lineHeight: 28 },
  h2:      { fontSize: 17, fontWeight: '700', color: C.text,    letterSpacing: -0.3, lineHeight: 22 },
  h3:      { fontSize: 14, fontWeight: '600', color: C.text,    lineHeight: 20 },
  body:    { fontSize: 14, fontWeight: '400', color: C.text,    lineHeight: 20 },
  bodySub: { fontSize: 13, fontWeight: '400', color: C.textSub, lineHeight: 18 },
  label:   { fontSize: 11, fontWeight: '600', color: C.textTert, letterSpacing: 0.6, textTransform: 'uppercase' },
  caption: { fontSize: 12, fontWeight: '400', color: C.textWeak },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 16,
    shadowColor: '#0B2D50',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 10,
  },

  // Input
  input: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: C.text,
    marginBottom: 14,
  },

  // Picker (select)
  picker: {
    backgroundColor: C.surface,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 14,
  },

  // Botão primário
  btn: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  btnTxt: {
    color: C.surface,
    fontSize: 15,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },

  // Seção
  secLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: C.textWeak,
    letterSpacing: 0.7,
    textTransform: 'uppercase' as const,
    marginTop: 20,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderLight,
  },
});
