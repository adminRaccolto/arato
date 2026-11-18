import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  OperationalGrid,
  OperationalButton,
} from "../../components/OperationalUI";
import { OperationalPresentation } from "../../components/arato-layout/presentation-mode";
import NativeRowActions from "../../components/arato-layout/NativeRowActions";

const td = { padding: "10px 14px", height: 28 };
function Fixture() {
  const [edicoes, setEdicoes] = useState(0),
    [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [reverso, setReverso] = useState(false),
    [oculto, setOculto] = useState(true);
  const bombas = [
    {
      id: "a",
      nome: "BOMBA A",
      fazenda: "Fazenda de demonstração com nome extenso",
      estoque: "5.008,916",
      pct: 46,
    },
    {
      id: "b",
      nome: "BOMBA B",
      fazenda: "Fazenda de demonstração B",
      estoque: "4.996,238",
      pct: 83,
    },
  ];
  return (
    <>
      <output data-testid="edicoes">{edicoes}</output>
      <OperationalPresentation active>
        <section data-testid="bombas">
          <OperationalGrid
            data-arato-grid="true"
            data-native-cadastro-grid="true"
            data-op-title="Bombas de Combustível"
            style={{ width: "100%", borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                {[
                  "Nome / Localização",
                  "Fazenda",
                  "Combustível",
                  "Capacidade (L)",
                  "Estoque atual (L)",
                  "% Cheio",
                  "Controle",
                  "Status",
                  "",
                ].map((s, i) => (
                  <th key={i}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bombas.map((b) => (
                <tr
                  key={b.id}
                  data-testid={`bomba-${b.id}`}
                  style={{ height: 32 }}
                >
                  <td style={td}>{b.nome}</td>
                  <td style={td}>{b.fazenda}</td>
                  <td style={td}>
                    <span>DIESEL S500</span>
                  </td>
                  <td style={td}>11.000,000</td>
                  <td style={td}>
                    <strong>{b.estoque}</strong>
                  </td>
                  <td style={td}>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <div
                        style={{ width: 60, height: 6, background: "#ccdce0" }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${b.pct}%`,
                            background: "#267e6d",
                          }}
                        />
                      </div>
                      <span>{b.pct}%</span>
                    </div>
                  </td>
                  <td style={td}>
                    <span>Estoque</span>
                  </td>
                  <td style={td}>
                    <span>Ativa</span>
                  </td>
                  <td style={td}>
                    <NativeRowActions>
                      <OperationalButton
                        onClick={() => setEdicoes((v) => v + 1)}
                      >
                        Editar
                      </OperationalButton>
                    </NativeRowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </OperationalGrid>
        </section>
        <section data-testid="financeiro" className="native-payable-workspace">
          <button data-testid="mostrar" onClick={() => setOculto((v) => !v)}>
            Mostrar pendente
          </button>
          <OperationalGrid
            data-op-title="Títulos de demonstração"
            data-arato-grid="true"
            style={{ width: 1500, minWidth: 1500 }}
          >
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={selecionados.size === 2}
                    onChange={(e) =>
                      setSelecionados(
                        new Set(e.target.checked ? ["a", "b"] : []),
                      )
                    }
                  />
                </th>
                <th>
                  <button onClick={() => setReverso((v) => !v)}>
                    Descrição
                  </button>
                </th>
                <th>Fornecedor</th>
                <th>Valor</th>
                <th>Observação</th>
                <th>Composição</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {(reverso ? ["b", "a"] : ["a", "b"]).map((id) => (
                <tr
                  key={id}
                  data-testid={`titulo-${id}`}
                  style={{ height: 28 }}
                >
                  <td colSpan={1} style={td}>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${id}`}
                      checked={selecionados.has(id)}
                      onChange={(e) =>
                        setSelecionados((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(id);
                          else n.delete(id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td
                    style={{
                      ...td,
                      width: 360,
                      minWidth: 360,
                      maxWidth: 360,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      position: "sticky",
                      left: 0,
                    }}
                  >
                    {id.toUpperCase()} · Serviço com descrição longa para
                    validar a quebra de linha na ficha
                  </td>
                  <td style={td}>
                    <div style={{ minWidth: 320, width: 320 }}>
                      Fornecedor com razão social extensa
                      <br />
                      Documento de demonstração
                    </div>
                  </td>
                  <td style={td}>
                    <strong>R$ 123.456,78</strong>
                  </td>
                  <td style={td}>
                    Observação extensa com vários detalhes que devem permanecer
                    inteiramente legíveis.
                  </td>
                  <td style={td}>
                    <table data-testid={`detalhes-${id}`}>
                      <tbody>
                        <tr>
                          <td>Principal</td>
                          <td>100,00</td>
                        </tr>
                        <tr>
                          <td>Encargos</td>
                          <td>10,00</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                  <td style={td}>
                    <button onClick={() => setEdicoes((v) => v + 1)}>
                      Conferir
                    </button>
                  </td>
                </tr>
              ))}
              <tr data-testid="pendente" hidden={oculto}>
                <td colSpan={7}>Pendente de demonstração</td>
              </tr>
              <tr>
                <td colSpan={7}>Total dos títulos</td>
              </tr>
            </tbody>
          </OperationalGrid>
        </section>
        <section data-testid="agrupado">
          <OperationalGrid data-op-title="Cabeçalho agrupado">
            <thead>
              <tr>
                <th colSpan={2}>Grupo</th>
              </tr>
              <tr>
                <th>Descrição</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Exemplo</td>
                <td>10,00</td>
              </tr>
            </tbody>
          </OperationalGrid>
        </section>
      </OperationalPresentation>
      <section data-testid="padrao">
        <OperationalPresentation active={false}>
          <OperationalGrid
            data-arato-grid="true"
            data-op-title="Tabela original"
          >
            <thead>
              <tr>
                <th>Registro</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={td}>Original</td>
                <td>
                  <button onClick={() => setEdicoes((v) => v + 1)}>
                    Ação original
                  </button>
                </td>
              </tr>
            </tbody>
          </OperationalGrid>
        </OperationalPresentation>
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
