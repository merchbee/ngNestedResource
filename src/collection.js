angular.module('ngNestedResource')
    .factory('BaseCollection', function ($filter) {
        var BaseCollection = function (model, perPage, pageNumber) {
            this.model = model;
            this.queryParams = {};
            this.page = pageNumber ? pageNumber : 1;
            this.perPage = perPage ? perPage : 20;
            this.totalItems = 0;
            this.totalPages = 0;
            this.pages = [];
            this.endReached = false;
            this.loading = false;
        };
        BaseCollection.prototype = [];

        BaseCollection.prototype.populate = function (data) {
            var collection = this;
            collection.clear();

            data.forEach(function (obj) {
                collection.push(new collection.model(obj));
            });

            return collection;
        };

        BaseCollection.prototype.loadMore = function (take, success, error) {
            if (this.allLoaded()) {
                // no need to generate another request in this  case
                return this;
            }

            var collection = this;

            this.queryParams.take = take ? take : this.perPage;
            this.queryParams.skip = this.length;

            collection.loading = true;
            return this.model.list(this.queryParams, success, error).then(function (results) {
                if (results.length < collection.queryParams.take) {
                    collection.endReached = true;
                }
                collection.setPagination(results.headers);
                angular.forEach(results, function (item) {
                    collection.push(item);
                });

                collection.loading = false;
                return collection;
            });
        };

        BaseCollection.prototype.query = function (params, success, error) {
            var collection = this;
            collection.queryParams = params ? params : {};

            collection.queryParams.skip = 0;
            if (!collection.queryParams.take) {
                collection.queryParams.take = collection.perPage;
            }

            collection.loading = true;
            return this.model.list(collection.queryParams, success, error).then(function (results) {
                collection.clear();
                collection.setPagination(results.headers);
                angular.forEach(results, function (item) {
                    collection.push(item);
                });

                collection.loading = false;
                return collection;
            });
        };

        BaseCollection.prototype.filter = function (params, success, error) {
            var collection = this;

            collection.queryParams.skip = 0;
            if (!collection.queryParams.take) {
                collection.queryParams.take = collection.perPage;
            }

            collection.loading = true;
            angular.extend(collection.queryParams, params);

            return this.model.list(collection.queryParams, success, error)
                .then(function (results) {
                    collection.clear();
                    collection.setPagination(results.headers);
                    angular.forEach(results, function (item) {
                        collection.push(item);
                    });

                    collection.loading = false;
                    return collection;
                });
        };

        BaseCollection.prototype.clear = function () {
            while (this.length > 0) {
                this.pop();
            }

            this.endReached = false;
        };

        BaseCollection.prototype.allLoaded = function () {
            return angular.isUndefined(this.queryParams.take) || this.queryParams.take > this.length || this.endReached;
        };

        // pagination methods
        BaseCollection.prototype.count = function (success, error) {
            var collection = this;

            return this.model.count(this.queryParams, function (count, headers) {
                collection.setPagination(undefined, count);
                success(count, headers);
                return count;
            }, error);
        };

        BaseCollection.prototype.setPagination = function (headers, count) {
            var collection = this;

            if (angular.isUndefined(headers) && angular.isUndefined(count)) {
                return 0;
            }

            collection.totalItems = count || headers('x-total-count') || collection.totalItems;
            collection.totalPages = (collection.totalItems >= collection.perPage) ? parseInt(collection.totalItems / collection.perPage) : 1;

            collection.pages = [];
            for (var i = 1; i <= collection.totalPages; i++) {
                collection.pages.push({
                    number: i,
                    text: i
                });
            }

        };

        BaseCollection.prototype.selectPage = function (page, params, success, error) {
            if (page > this.totalPages || page < 1) {
                return;
            }

            if (params) {
                this.queryParams = params;
            }

            var collection = this;

            this.queryParams.take = this.perPage;
            this.queryParams.skip = (page - 1) * this.perPage;
            this.page = page;

            collection.loading = true;
            return this.model.list(this.queryParams, success, error).then(function (results) {
                collection.clear();
                angular.forEach(results, function (item) {
                    collection.push(item);
                });

                
                return collection;
            });

        };

        BaseCollection.prototype.noPrevious = function () {
            return this.page === 1;
        };

        BaseCollection.prototype.noNext = function () {
            return this.page === this.totalPages;
        };

        /**
         * Searching for model in collection.
         * @param value
         * @param type
         * @returns BaseModel | null
         */
        BaseCollection.prototype.findByType = function (value, type) {
            type = type || 'id';

            for (var i = 0; i < this.length; i++) {
                if (this[i][type] == value ) {
                    return this[i];
                }
            }

            return null;
        };

        BaseCollection.prototype.remove = function (model) {
            var index = -1;

            angular.forEach(this, function (item, k) {
                if (index == -1 && item.id == model.id) {
                    index = k;
                }
            });

            if (index > -1) {
                this.splice(index, 1);
            }

            model.destroy();
        };

        return function (model) {
            var Collection = function (perPage, pageNumber) {
                return new BaseCollection(model, perPage, pageNumber);
            };
            Collection.prototype = BaseCollection.prototype;
            Collection.model = model;

            return Collection;
        };
    });
