const network = "https://w3id.org/modavis/vocab/";
export const vocabularyReferenceLinks = {
  pipeOrgan: "/vocab/reference?" + new URLSearchParams({ collection: "network", uri: network + "instrument-type/pipe-organ" }),
  evidenceRoles: "/vocab/reference?" + new URLSearchParams({ collection: "network", scheme: network + "evidence-role" }),
  heritageRecognition: "/vocab/reference?" + new URLSearchParams({ collection: "network", scheme: network + "heritage-recognition-status" }),
  omaroOrgan: "/vocab/omaro?" + new URLSearchParams({ collection: "instruments", uri: "http://www.mimo-db.eu/InstrumentsKeywords/2266" }),
};
