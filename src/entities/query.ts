import { MySet } from "../utils/collections";
import { Variable } from "./variable";

// TODO: Get query name
// const queryScriptPattern: RegExp = /((?:setSql|queryExecute)\s*\(|sql\s*=)\s*(['"])([\s\S]*?)\2\s*[),]/gi;

export const queryValuePattern: RegExp = /^(?:["']\s*#\s*)?(query(?:New|Execute)?)\(/i;

const selectQueryPattern: RegExp = /^\s*SELECT\s+([\s\S]+?)\s+FROM\s+[\s\S]+/i;

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

export interface Query extends Variable {
  selectColumnNames: QueryColumns;
}

export class QueryColumns extends MySet<string> { }

export function getSelectColumnsFromQueryText(sql: string): QueryColumns {
  let selectColumnNames: QueryColumns = new MySet();

  if (sql) {
    const selectQueryMatch: RegExpMatchArray = sql.match(selectQueryPattern);

    if (selectQueryMatch) {
      const columns: string = selectQueryMatch[1];
      columns.replace(/[\[\]"`]/g, "").split(",").forEach((column: string) => {
        const splitColumn: string[] = column.trim().split(/[\s.]+/);
        if (splitColumn.length > 0) {
          const columnName = splitColumn.pop();
          if (columnName !== "*") {
            selectColumnNames.add(columnName);
          }
        }
      });
    }
  }

  return selectColumnNames;
}

/**
 * Checks whether a Variable is a Query
 * @param variable The variable object to check
 */
export function isQuery(variable: Variable): variable is Query {
  return "selectColumnNames" in variable;
}
