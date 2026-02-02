document.addEventListener('DOMContentLoaded', function () {
            var signatures = Array.isArray(window.SIGNATURES) ? window.SIGNATURES.slice() : [];
            var searchInput = document.getElementById('signatureSearch');
            var results = document.getElementById('signatureResults');
            var resultsCount = document.getElementById('resultsCount');
            var prevPageButton = document.getElementById('prevPage');
            var nextPageButton = document.getElementById('nextPage');
            var pageStatus = document.getElementById('pageStatus');
            var notAvailable = document.getElementById('notAvailable');
            var loadButton = document.getElementById('loadSignature');
            var copyButton = document.getElementById('copySignature');
            var previewEmpty = document.getElementById('previewEmpty');
            var previewName = document.getElementById('previewName');
            var signatureFrame = document.getElementById('signatureFrame');
            var tutorialButton = document.getElementById('tutorialButton');
            var tutorialModal = document.getElementById('tutorialModal');
            var closeTutorial = document.getElementById('closeTutorial');
            var toast = document.getElementById('toast');
            var currentSignatureHtml = '';
            var pageSize = 10;
            var currentPage = 1;
            var filteredCache = [];

            signatures = signatures
                .filter(function (item) {
                    return item && item.name && item.url;
                })
                .map(function (item) {
                    return {
                        name: String(item.name).trim(),
                        url: String(item.url).trim()
                    };
                })
                .filter(function (item) {
                    return item.name && item.url;
                })
                .sort(function (a, b) {
                    return a.name.localeCompare(b.name);
                });

            var dataList = document.getElementById('signatureNames');
            signatures.forEach(function (signature) {
                var option = document.createElement('option');
                option.value = signature.name;
                dataList.appendChild(option);
            });

            function showToast(message) {
                toast.textContent = message;
                toast.classList.add('show');
                setTimeout(function () {
                    toast.classList.remove('show');
                }, 2200);
            }

            function resolveUrl(url) {
                if (!url) {
                    return '';
                }
                if (window.location.protocol === 'file:') {
                    return url.split('/').pop();
                }
                return url;
            }

            function renderResults(filterText) {
                var term = (filterText || '').trim().toLowerCase();
                results.innerHTML = '';
                var filtered = signatures.filter(function (signature) {
                    return signature.name.toLowerCase().indexOf(term) > -1;
                });

                filteredCache = filtered;
                var total = filtered.length;
                var totalPages = Math.max(1, Math.ceil(total / pageSize));
                if (currentPage > totalPages) {
                    currentPage = totalPages;
                }
                if (currentPage < 1) {
                    currentPage = 1;
                }

                var startIndex = (currentPage - 1) * pageSize;
                var endIndex = Math.min(startIndex + pageSize, total);
                resultsCount.textContent = total ? (startIndex + 1) + '-' + endIndex + ' of ' + total : '0 results';
                pageStatus.textContent = 'Page ' + currentPage + ' of ' + totalPages;
                prevPageButton.disabled = currentPage === 1;
                nextPageButton.disabled = currentPage === totalPages || total === 0;

                notAvailable.style.display = (term && total === 0) ? 'block' : 'none';

                filtered.slice(startIndex, endIndex).forEach(function (signature) {
                    var button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'result-item';
                    button.innerHTML = '<span>' + signature.name + '</span><small>Load</small>';
                    button.addEventListener('click', function () {
                        searchInput.value = signature.name;
                        loadSignature(signature);
                    });
                    results.appendChild(button);
                });
            }

            function findSignature(name) {
                var term = (name || '').trim().toLowerCase();
                if (!term) {
                    return null;
                }
                var exact = signatures.find(function (signature) {
                    return signature.name.toLowerCase() === term;
                });
                if (exact) {
                    return exact;
                }
                return signatures.find(function (signature) {
                    return signature.name.toLowerCase().indexOf(term) > -1;
                }) || null;
            }

            function adjustFrameHeight() {
                try {
                    var doc = signatureFrame.contentDocument || signatureFrame.contentWindow.document;
                    if (doc && doc.body) {
                        var height = Math.max(doc.body.scrollHeight, 260);
                        signatureFrame.style.height = height + 'px';
                    }
                } catch (error) {
                    // Ignore cross-origin errors.
                }
            }

            function buildPreviewDocument(htmlText) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(htmlText, 'text/html');
                var bodyHtml = doc.body ? doc.body.innerHTML.trim() : '';
                var styles = Array.from(doc.querySelectorAll('style, link[rel="stylesheet"]'))
                    .map(function (node) {
                        return node.outerHTML;
                    })
                    .join('');
                currentSignatureHtml = bodyHtml;
                return '<!doctype html><html><head><meta charset="utf-8">' + styles + '</head><body>' + bodyHtml + '</body></html>';
            }

            function loadSignature(signature) {
                if (!signature) {
                    return;
                }
                copyButton.disabled = true;
                previewEmpty.textContent = 'Loading signature...';
                previewEmpty.style.display = 'block';
                signatureFrame.style.display = 'none';

                var url = resolveUrl(signature.url);

                fetch(url, { cache: 'no-cache' })
                    .then(function (response) {
                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }
                        return response.text();
                    })
                    .then(function (htmlText) {
                        var previewDoc = buildPreviewDocument(htmlText);
                        signatureFrame.srcdoc = previewDoc;
                        signatureFrame.onload = function () {
                            signatureFrame.style.display = 'block';
                            previewEmpty.style.display = 'none';
                            previewName.textContent = signature.name;
                            copyButton.disabled = !currentSignatureHtml;
                            adjustFrameHeight();
                        };
                    })
                    .catch(function () {
                        previewEmpty.textContent = 'Could not load the signature. Please try again.';
                        previewName.textContent = 'Preview unavailable.';
                    });
            }

            function getPlainText(html) {
                var temp = document.createElement('div');
                temp.innerHTML = html;
                return temp.textContent || temp.innerText || '';
            }

            function fallbackCopy() {
                var temp = document.createElement('div');
                temp.style.position = 'fixed';
                temp.style.left = '-9999px';
                temp.style.top = '0';
                temp.innerHTML = currentSignatureHtml;
                document.body.appendChild(temp);

                var range = document.createRange();
                range.selectNodeContents(temp);
                var selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                var successful = false;
                try {
                    successful = document.execCommand('copy');
                } catch (error) {
                    successful = false;
                }

                selection.removeAllRanges();
                document.body.removeChild(temp);

                if (successful) {
                    showToast('Signature copied. Paste it into Gmail.');
                } else {
                    showToast('Copy failed. Select the preview and press Ctrl/Cmd+C.');
                }
            }

            function copySignature() {
                if (!currentSignatureHtml) {
                    return;
                }
                var plainText = getPlainText(currentSignatureHtml);

                if (navigator.clipboard && window.ClipboardItem) {
                    var htmlBlob = new Blob([currentSignatureHtml], { type: 'text/html' });
                    var textBlob = new Blob([plainText], { type: 'text/plain' });
                    var item = new ClipboardItem({
                        'text/html': htmlBlob,
                        'text/plain': textBlob
                    });

                    navigator.clipboard.write([item]).then(function () {
                        showToast('Signature copied. Paste it into Gmail.');
                    }).catch(function () {
                        fallbackCopy();
                    });
                } else {
                    fallbackCopy();
                }
            }

            searchInput.addEventListener('input', function () {
                currentPage = 1;
                renderResults(searchInput.value);
            });

            searchInput.addEventListener('change', function () {
                var match = findSignature(searchInput.value);
                if (match) {
                    loadSignature(match);
                }
            });

            searchInput.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    var match = findSignature(searchInput.value);
                    if (match) {
                        loadSignature(match);
                    } else {
                        notAvailable.style.display = 'block';
                    }
                }
            });

            loadButton.addEventListener('click', function () {
                var match = findSignature(searchInput.value);
                if (match) {
                    loadSignature(match);
                } else {
                    notAvailable.style.display = 'block';
                }
            });

            copyButton.addEventListener('click', copySignature);

            prevPageButton.addEventListener('click', function () {
                if (currentPage > 1) {
                    currentPage -= 1;
                    renderResults(searchInput.value);
                }
            });

            nextPageButton.addEventListener('click', function () {
                var totalPages = Math.max(1, Math.ceil(filteredCache.length / pageSize));
                if (currentPage < totalPages) {
                    currentPage += 1;
                    renderResults(searchInput.value);
                }
            });

            tutorialButton.addEventListener('click', function () {
                tutorialModal.style.display = 'block';
            });

            closeTutorial.addEventListener('click', function () {
                tutorialModal.style.display = 'none';
            });

            window.addEventListener('click', function (event) {
                if (event.target === tutorialModal) {
                    tutorialModal.style.display = 'none';
                }
            });

            renderResults('');
        });
