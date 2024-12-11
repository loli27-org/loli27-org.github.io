const utils = require('../../../../utils');
const globalUtils = require('../../../../utils/global');
const {
    ACLTypes
} = require('../../../../utils/types');

const Document = require('../../../../schemas/document');
const History = require('../../../../schemas/history');

const ACL = require('../../../../class/acl');

const dummyDocument = {
    readable: false
}
const getDocument = async (document, namumark) => {
    const { namespace, title } = document;

    const dbDocument = await Document.findOne({
        namespace,
        title
    });
    if(!dbDocument) return dummyDocument;

    const rev = await History.findOne({
        document: dbDocument.uuid
    }).sort({ rev: -1 });
    if(!rev.content) return dummyDocument;

    const acl = await ACL.get({ document: dbDocument }, document);
    const { result: readable } = await acl.check(ACLTypes.Read, namumark.aclData);

    return {
        document,
        dbDocument,
        acl,
        readable,
        content: rev?.content
    }
}

const getCachedDocument = async (name, namumark) => {
    const contentCache = namumark.syntaxData.contentCache ??= {};

    const document = utils.parseDocumentName(name);
    const fullName = globalUtils.doc_fulltitle(document);

    return contentCache[fullName] ??= await getDocument(document, namumark);
}

module.exports = async (params, namumark) => {
    if(namumark.includeData) return '';

    // const removeNewParagraph = params.startsWith('<removeNewParagraph/>');
    // if(removeNewParagraph) params = params.slice('<removeNewParagraph/>'.length);
    const removeNoParagraph = params.startsWith('<!noParagraph>');
    if(removeNoParagraph) params = params.slice('<!noParagraph>'.length);

    params = params.split(/(?<!\\),/).map(a => a.replaceAll('\\,', ','));

    const docName = params[0];
    params = params.slice(1);

    const includeData = {};
    for(let param of params) {
        const splittedParam = param.split('=');
        if(splittedParam.length < 2) continue;

        const key = splittedParam[0].trim();
        includeData[key] = splittedParam.slice(1).join('=');
    }

    const document = await getCachedDocument(docName, namumark);
    if(!document.readable) return '';

    const parser = new namumark.NamumarkParser({
        document: document.document,
        aclData: namumark.aclData,
        req: namumark.req,
        includeData
    });

    const { html: contentHtml } = await parser.parse(document.content);
    return `${removeNoParagraph ? '' : '<!noParagraph>'}${contentHtml}${removeNoParagraph ? '' : '<!/noParagraph>'}`;
}