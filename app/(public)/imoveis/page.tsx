"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PublicSearchPage() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [bedrooms, setBedrooms] = useState("");

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const params = new URLSearchParams();

    const q = query.trim();
    if (q) params.set("query", q);
    if (purpose) params.set("purpose", purpose);
    if (minPrice) params.set("min", minPrice);
    if (maxPrice) params.set("max", maxPrice);
    if (bedrooms) params.set("bedrooms", bedrooms);

    // Resultados em /imoveis/resultados
    const qs = params.toString();
    router.push(qs ? `/imoveis/resultados?${qs}` : "/imoveis/resultados");
  };

  return (
    <main className="pv-main">
      <div className="pv-container">
        <div className="pv-glass">
          <section className="pv-hero pv-hero-search">
            <h1 className="pv-title">Encontre seu imóvel ideal</h1>
            <p className="pv-subtitle">
              Busque por localização, preço e características
            </p>

            <form onSubmit={handleSearch} className="pv-searchbar">
              <div className="pv-field">
                <div className="pv-label">Localização</div>
                <input
                  className="pv-input"
                  type="text"
                  placeholder="Rua, bairro ou código"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="pv-field">
                <div className="pv-label">Tipo</div>
                <select
                  className="pv-select"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                >
                  <option value="">Comprar ou Alugar</option>
                  <option value="sale">Comprar</option>
                  <option value="rent">Alugar</option>
                </select>
              </div>

              <div className="pv-field">
                <div className="pv-label">Preço mínimo</div>
                <input
                  className="pv-input"
                  type="number"
                  inputMode="numeric"
                  placeholder="Preço mínimo"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
              </div>

              <div className="pv-field">
                <div className="pv-label">Preço máximo</div>
                <input
                  className="pv-input"
                  type="number"
                  inputMode="numeric"
                  placeholder="Preço máximo"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>

              <div className="pv-field">
                <div className="pv-label">Quartos</div>
                <select
                  className="pv-select"
                  value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)}
                >
                  <option value="">Quartos</option>
                  <option value="1">1+</option>
                  <option value="2">2+</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                </select>
              </div>

              <button type="submit" className="pv-btn pv-btn-primary">
                Buscar imóveis
              </button>
            </form>
          </section>

          <section style={{ marginTop: 22, textAlign: "center" }}>
            <h2 style={{ margin: 0 }}>Newsletter</h2>
            <p style={{ margin: "8px 0 14px", opacity: 0.8 }}>
              Inscreva-se para receber novidades sobre imóveis
            </p>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                className="pv-input"
                type="email"
                placeholder="Seu email"
                style={{ width: 320, maxWidth: "100%" }}
              />
              <button
                type="button"
                className="pv-btn"
                style={{ background: "var(--cobalt)", color: "white" }}
              >
                Inscrever
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
