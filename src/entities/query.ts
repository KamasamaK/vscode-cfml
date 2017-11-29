import { MySet } from "../utils/collections";

// const cfqueryTagPattern: RegExp = getTagPattern("cfquery");
// TODO: Get query name
// const queryScriptPattern: RegExp = /((?:setSql|queryExecute)\s*\(|sql\s*=)\s*(['"])([\s\S]*?)\2\s*[),]/gi;

export const queryObjectProperties = {
  "columnList": {
    detail: "(property) queryName.columnList",
    description: "Comma-separated list of the query columns."
  },
  "currentRow": {
    detail: "(property) queryName.currentRow",
    description: "Current row of query that is processing within a loop."
  },
  "recordCount": {
    detail: "(property) queryName.recordCount",
    description: "Number of records (rows) returned from the query."
  },
};

export const queryResultProperties = {
  "cached": {
    detail: "(property) resultName.cached",
    description: "True if the query was cached; False otherwise."
  },
  "columnList": {
    detail: "(property) resultName.columnList",
    description: "Comma-separated list of the query columns."
  },
  "executionTime": {
    detail: "(property) resultName.executionTime",
    description: "Cumulative time required to process the query."
  },
  "generatedKey": {
    detail: "(property) resultName.generatedKey",
    description: "Supports all databases. The ID of an inserted row."
  },
  "recordCount": {
    detail: "(property) resultName.recordCount",
    description: "Number of records (rows) returned from the query."
  },
  "sql": {
    detail: "(property) resultName.sql",
    description: "The SQL statement that was executed."
  },
  "sqlParameters": {
    detail: "(property) resultName.sqlParameters",
    description: "An ordered Array of cfqueryparam values."
  },
};

export interface Query {
  name: string;
  result?: string;
  selectColumnNames: MySet<string>;
}
