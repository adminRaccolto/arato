"use client";
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { OperationalButton } from "../OperationalUI";
import {
  ABAS_EMISSAO_NFE,
  moverAbaEmissao,
  type AbaEmissaoNfe,
} from "../../lib/fiscal/editor-nfe";

type Props = {
  titulo: string;
  subtitulo?: string;
  aba: AbaEmissaoNfe;
  onAba: (aba: AbaEmissaoNfe) => void;
  onFechar: () => void;
  onVoltar?: () => void;
  ocupado?: boolean;
  children: ReactNode;
  total: string;
  financeiro?: string;
  erro?: string | null;
  onEspelho?: () => void;
  onSalvar?: () => void;
  onEmitir?: () => void;
  onRegistrarExterno?: () => void;
};

/** Moldura única da emissão. Não monta payloads nem executa ações fiscais por conta própria. */
export function EditorNfe({
  titulo,
  subtitulo,
  aba,
  onAba,
  onFechar,
  onVoltar,
  ocupado = false,
  children,
  total,
  financeiro,
  erro,
  onEspelho,
  onSalvar,
  onEmitir,
  onRegistrarExterno,
}: Props) {
  const id = useId(),
    dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    dialog.current
      ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
      ?.focus();
    return () => {
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);
  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (!ocupado) onFechar();
    }
    if (e.key !== "Tab") return;
    const campos = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      ) ?? [],
    ).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
    const primeiro = campos[0],
      ultimo = campos.at(-1);
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo?.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro?.focus();
    }
  };
  const trocarPorTeclado = (e: KeyboardEvent<HTMLButtonElement>) => {
    const proxima =
      e.key === "ArrowRight"
        ? moverAbaEmissao(aba, 1, true)
        : e.key === "ArrowLeft"
          ? moverAbaEmissao(aba, -1, true)
          : e.key === "Home"
            ? ABAS_EMISSAO_NFE[0].id
            : e.key === "End"
              ? ABAS_EMISSAO_NFE.at(-1)!.id
              : null;
    if (!proxima) return;
    e.preventDefault();
    onAba(proxima);
    document.getElementById(`${id}-aba-${proxima}`)?.focus();
  };
  return (
    <div
      ref={dialog}
      className="nfe-editor"
      data-arato-dialog="form"
      data-arato-compacto="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-titulo`}
      onKeyDown={teclado}
    >
      <header className="nfe-editor-header">
        {onVoltar && (
          <OperationalButton
            type="button"
            data-arato-button="secondary"
            className="nfe-editor-back"
            disabled={ocupado}
            onClick={onVoltar}
          >
            ← Origem
          </OperationalButton>
        )}
        <div>
          <span className="nfe-editor-eyebrow">Emissão de NF-e</span>
          <h2 id={`${id}-titulo`}>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <OperationalButton
          type="button"
          data-arato-button="icon"
          className="nfe-editor-close"
          aria-label="Fechar emissão"
          disabled={ocupado}
          onClick={onFechar}
        >
          ×
        </OperationalButton>
      </header>
      <div
        className="nfe-editor-tabs"
        data-arato-tabs="true"
        role="tablist"
        aria-label="Dados da NF-e"
      >
        {ABAS_EMISSAO_NFE.map((a) => (
          <OperationalButton
            type="button"
            key={a.id}
            id={`${id}-aba-${a.id}`}
            role="tab"
            aria-selected={aba === a.id}
            aria-controls={`${id}-painel`}
            tabIndex={aba === a.id ? 0 : -1}
            data-arato-tab="true"
            data-arato-tab-active={aba === a.id}
            data-arato-button="toggle"
            onClick={() => onAba(a.id)}
            onKeyDown={trocarPorTeclado}
          >
            {a.label}
          </OperationalButton>
        ))}
      </div>
      <div
        className="nfe-editor-content"
        id={`${id}-painel`}
        role="tabpanel"
        aria-labelledby={`${id}-aba-${aba}`}
        tabIndex={0}
      >
        {children}
      </div>
      <footer className="nfe-editor-footer">
        <div className="nfe-editor-summary">
          <span>
            Total da NF-e <strong>{total}</strong>
          </span>
          {financeiro && (
            <span>
              Financeiro <strong>{financeiro}</strong>
            </span>
          )}
        </div>
        {erro && (
          <div className="nfe-editor-error" role="alert">
            {erro}
          </div>
        )}
        <div className="nfe-editor-actions">
          <OperationalButton
            type="button"
            data-arato-button="secondary"
            onClick={onFechar}
            disabled={ocupado}
          >
            Cancelar
          </OperationalButton>
          <div className="nfe-editor-navigation">
            <OperationalButton
              type="button"
              data-arato-button="secondary"
              onClick={() => onAba(moverAbaEmissao(aba, -1))}
              disabled={aba === ABAS_EMISSAO_NFE[0].id}
            >
              ← Anterior
            </OperationalButton>
            <OperationalButton
              type="button"
              data-arato-button="secondary"
              onClick={() => onAba(moverAbaEmissao(aba, 1))}
              disabled={aba === ABAS_EMISSAO_NFE.at(-1)!.id}
            >
              Próxima →
            </OperationalButton>
          </div>
          <div className="nfe-editor-commands">
            {onEspelho && (
              <OperationalButton
                type="button"
                data-arato-button="secondary"
                onClick={onEspelho}
                disabled={ocupado}
                title="Confira o DANFE sem transmitir a nota."
              >
                Espelho
              </OperationalButton>
            )}
            {onSalvar && (
              <OperationalButton
                type="button"
                data-arato-button="secondary"
                onClick={onSalvar}
                disabled={ocupado}
                title="Salva o rascunho para conferência e transmissão no Painel de Notas."
              >
                Salvar e enviar ao painel
              </OperationalButton>
            )}
            {onEmitir && (
              <OperationalButton
                type="button"
                data-arato-button="primary"
                onClick={onEmitir}
                disabled={ocupado}
              >
                Emitir agora
              </OperationalButton>
            )}
            {onRegistrarExterno && (
              <OperationalButton
                type="button"
                data-arato-button="primary"
                onClick={onRegistrarExterno}
                disabled={ocupado}
              >
                Registrar remessa
              </OperationalButton>
            )}
          </div>
        </div>
        {ocupado && (
          <span className="nfe-editor-progress" role="status">
            Aguarde a conclusão da operação…
          </span>
        )}
      </footer>
    </div>
  );
}
export function SecaoNfe({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <section className="nfe-editor-section" aria-label={titulo}>
      <div className="nfe-editor-section-heading">
        <h3>{titulo}</h3>
        {descricao && <p>{descricao}</p>}
      </div>
      {children}
    </section>
  );
}
