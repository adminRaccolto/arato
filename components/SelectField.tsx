"use client";
import type { SelectHTMLAttributes } from "react";

export default function SelectField(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <div className="arato-native-select"><select {...props} /></div>;
}
